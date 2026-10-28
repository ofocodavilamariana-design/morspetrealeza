'use strict';
const crypto = require('crypto');
const { getAdmin, ADMIN_UID } = require('../lib/firebase-admin.cjs');
class HttpError extends Error { constructor(status,message){ super(message); this.status=status; } }
function fail(status,message){ throw new HttpError(status,message); }
function id(value) { return typeof value==='string' && value.length>0 && value.length<=150 && !/[\/\u0000-\u001f]/.test(value) && value!=='.' && value!=='..'; }
function txt(value,max,optional=false) { if (typeof value!=='string') fail(400,'Texto inválido.'); const v=value.trim(); if ((!v&&!optional)||v.length>max) fail(400,'Confira os textos informados.'); return v; }
function number(v, decimals=2) { if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000||Math.abs(v*10**decimals-Math.round(v*10**decimals))>1e-6) fail(400,'Confira os valores informados.'); return v; }
function civilDate(v) { if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d=new Date(v+'T00:00:00Z'); return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v; }
function spDate() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function asISO(v){return v && typeof v.toDate==='function' ? v.toDate().toISOString() : null;}
function key(req){const v=req.body?.requestId;if(!id(v)||!/^[a-f0-9-]{36}$/i.test(v))fail(400,'Identificador da operação inválido.');return v;}
function refFor(db,collection,value) { if(!id(value)) fail(400,'Identificador inválido.');return db.collection(collection).doc(value); }
async function authorize(req,admin){
  const m=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization||'');
  if(!m) fail(401,'Faça login novamente.');
  let decoded;try{decoded=await admin.auth().verifyIdToken(m[1],true);}catch(_){fail(401,'Sessão expirada. Entre novamente.');}
  if(decoded.uid!==ADMIN_UID || decoded.admin!==true) fail(403,'Acesso não autorizado.');
  return decoded.uid;
}
async function mutation(db,admin,requestId,kind,payloadHash,fn){
  const operation=db.collection('management_operations').doc(requestId);
  return db.runTransaction(async tx=>{
    const prior=await tx.get(operation);
    if(prior.exists){ const p=prior.data(); if(p.kind!==kind || p.payloadHash!==payloadHash)fail(409,'Esta tentativa já foi registrada com outros dados. Atualize a tela antes de tentar novamente.');return p.result; }
    const result=await fn(tx);
    tx.create(operation,{kind,payloadHash,result,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    return result;
  });
}
module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  try {
    const admin=getAdmin(), uid=await authorize(req,admin), db=admin.firestore();
    const resource=req.query.resource;
    if(req.method==='GET'&&resource==='snapshot'){
      const [products,payments]=await Promise.all([db.collection('inventory_products').get(),db.collection('service_payments').get()]);
      return res.status(200).json({products:products.docs.map(d=>({id:d.id,...d.data()})),payments:payments.docs.map(d=>d.data())});
    }
    if(req.method==='GET'&&resource==='history'){
      const product=refFor(db,'inventory_products',req.query.productId);
      const snap=await db.collection('inventory_events').where('productId','==',product.id).get();
      const movements=snap.docs.map(d=>{const v=d.data();return {type:v.type,quantity:v.quantity,note:v.note,createdAt:asISO(v.createdAt)};}).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      return res.status(200).json({movements});
    }
    if(req.method!=='POST') fail(405,'Método não permitido.');
    const data=req.body||{}, requestId=key(req), payloadHash=crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    if(resource==='product'){
      const name=txt(data.name,100),unit=txt(data.unit,30),supplier=txt(data.supplier,100,true),minimum=number(data.minimum,3),cost=data.cost===null?null:number(data.cost,2);
      const product=data.id?refFor(db,'inventory_products',data.id):db.collection('inventory_products').doc();
      const creating=!data.id, initial=creating?number(data.quantity,3):null;
      const event=db.collection('inventory_events').doc(requestId);
      const result=await mutation(db,admin,requestId,resource,payloadHash,async tx=>{
        if(!creating){const old=await tx.get(product);if(!old.exists)fail(404,'Produto não encontrado.');}
        const value={name,unit,supplier,minimum,cost,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedBy:uid};
        if(creating){tx.create(product,{...value,quantity:initial,createdAt:admin.firestore.FieldValue.serverTimestamp()});tx.create(event,{productId:product.id,type:'entrada_inicial',quantity:initial,before:0,after:initial,note:'Saldo inicial do cadastro',createdAt:admin.firestore.FieldValue.serverTimestamp(),actor:uid});}
        else tx.update(product,value);
        return {ok:true,id:product.id};
      });return res.status(200).json(result);
    }
    if(resource==='movement'){
      const product=refFor(db,'inventory_products',data.productId),type=data.type,amount=number(data.quantity,3),note=txt(data.note,200);
      if(!['entrada','consumo','venda','ajuste'].includes(type)||(type!=='ajuste'&&amount===0))fail(400,'Movimentação inválida.');
      const event=db.collection('inventory_events').doc(requestId);
      const result=await mutation(db,admin,requestId,resource,payloadHash,async tx=>{
        const snap=await tx.get(product);if(!snap.exists)fail(404,'Produto não encontrado.');
        const old=number(snap.data().quantity,3),before=Math.round(old*1000),q=Math.round(amount*1000),after=type==='ajuste'?q:type==='entrada'?before+q:before-q;
        if(after<0||after>1000000000) fail(409,'Saldo insuficiente ou acima do limite.');
        tx.update(product,{quantity:after/1000,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedBy:uid});
        tx.create(event,{productId:product.id,type,quantity:amount,before:old,after:after/1000,note,createdAt:admin.firestore.FieldValue.serverTimestamp(),actor:uid});return {ok:true};
      });return res.status(200).json(result);
    }
    if(resource==='payment'){
      const booking=refFor(db,'bookings',data.bookingId),pay=db.collection('service_payments').doc(booking.id),event=db.collection('payment_events').doc(requestId);
      if(!['pago','pendente'].includes(data.status))fail(400,'Situação inválida.');const amount=number(data.amount,2);
      if(data.status==='pago'&&!civilDate(data.paymentDate))fail(400,'Data do pagamento inválida.');
      const paymentDate=data.status==='pago'?data.paymentDate:null;
      const result=await mutation(db,admin,requestId,resource,payloadHash,async tx=>{
        const [b,p]=await Promise.all([tx.get(booking),tx.get(pay)]);if(!b.exists||b.data().status==='cancelado')fail(409,'Atendimento inexistente ou cancelado.');if(p.exists&&p.data().status==='pago')fail(409,'Este atendimento já foi registrado como pago.');
        const entry={bookingId:booking.id,status:data.status,amount,paymentDate,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedBy:uid};
        tx.set(pay,entry);tx.create(event,{...entry,previous:p.exists?p.data():null,createdAt:admin.firestore.FieldValue.serverTimestamp(),source:'manual'});return {ok:true};
      });return res.status(200).json(result);
    }
    if(resource==='complete'){
      const booking=refFor(db,'bookings',data.bookingId), pay=db.collection('service_payments').doc(booking.id), event=db.collection('payment_events').doc(requestId);
      const result=await mutation(db,admin,requestId,resource,payloadHash,async tx=>{
        const [b,p]=await Promise.all([tx.get(booking),tx.get(pay)]);if(!b.exists)fail(404,'Atendimento não encontrado.');
        const info=b.data();if(info.status!=='confirmado')fail(409,'Somente um atendimento confirmado pode ser concluído.');
        let amount=null; if(p.exists&&p.data().status==='pendente')amount=number(p.data().amount,2);else if(!p.exists&&typeof info.price==='number'&&Number.isFinite(info.price)&&info.price>=0&&info.price<=1000000&&Math.abs(info.price*100-Math.round(info.price*100))<1e-6)amount=info.price;
        let paymentState='sem_preco';
        if(p.exists&&p.data().status==='pago') paymentState='ja_pago';
        else if(amount!==null){ const entry={bookingId:booking.id,status:'pago',amount,paymentDate:spDate(),updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedBy:uid};tx.set(pay,entry);tx.create(event,{...entry,previous:p.exists?p.data():null,createdAt:admin.firestore.FieldValue.serverTimestamp(),source:'conclusao'});paymentState='pago'; }
        tx.update(booking,{status:'concluido'});return {ok:true,paymentState};
      });return res.status(200).json(result);
    }
    fail(404,'Recurso não encontrado.');
  } catch(err){
    if(err instanceof HttpError)return res.status(err.status).json({error:err.message});
    console.error('Falha no serviço de gestão:', err.code||err.name||'erro');
    return res.status(503).json({error:'Serviço indisponível. Confira a configuração e as permissões do servidor.'});
  }
};
