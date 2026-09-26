import { requireSupabase } from "./supabase";

const TABLE = "orders";
const STAFF_SESSION_KEY = "hanaa-auth-session";
const CLIENT_ORDER_IDS_KEY = "hanaa-client-order-ids";
const LEGACY_CLIENT_ORDER_KEY = "hanaa-order";
const PENDING_ORDER_QUEUE_KEY = "hanaa-pending-order-writes-v2";
const TIMEOUT_MS = 12000;
const RETRYABLE = new Set([408,425,429,500,502,503,504]);
let createInFlight = null;
const subscribers = new Set();
let pollTimer = null;

function readSession(){try{return JSON.parse(localStorage.getItem(STAFF_SESSION_KEY)||sessionStorage.getItem(STAFF_SESSION_KEY)||"null")}catch{return null}}
function staff(){return ["ADMIN","SNACK","LIVREUR"].includes(String(readSession()?.role||"").toUpperCase())}
function ids(){const out=new Set();try{(JSON.parse(localStorage.getItem(CLIENT_ORDER_IDS_KEY)||"[]")||[]).forEach(x=>x&&out.add(String(x)))}catch{}try{const x=JSON.parse(localStorage.getItem(LEGACY_CLIENT_ORDER_KEY)||"null")?.id;if(x)out.add(String(x))}catch{}return [...out]}
function remember(id){if(staff()||!id)return;localStorage.setItem(CLIENT_ORDER_IDS_KEY,JSON.stringify([...new Set([...ids(),String(id)])].slice(-50)))}
const toRow=o=>({id:String(o.id),customer_name:o.customerName||null,customer_phone:o.customerPhone||null,order_type:o.orderType||null,branch_id:o.branchId||null,branch_name:o.branchName||null,delivery_address:o.deliveryAddress||"",customer_latitude:o.customerLatitude??null,customer_longitude:o.customerLongitude??null,distance_km:o.distanceKm??null,estimated_travel_time:o.estimatedTravelTime!=null?Math.round(Number(o.estimatedTravelTime)):null,delivery_fee:o.deliveryFee??0,payment_method:o.paymentMethod||null,subtotal:o.subtotal??0,total:o.total??0,status:o.status??0,status_label:o.statusLabel||null,items:o.items||[],status_history:o.statusHistory||[],driver_id:o.driverId||null,payload:o,created_at:o.createdAt||new Date().toISOString(),updated_at:new Date().toISOString()});
const fromRow=r=>({...r?.payload,id:r.id,customerName:r.customer_name??r?.payload?.customerName??"",customerPhone:r.customer_phone??r?.payload?.customerPhone??"",orderType:r.order_type??r?.payload?.orderType??"",branchId:r.branch_id??r?.payload?.branchId??"",branchName:r.branch_name??r?.payload?.branchName??"",deliveryAddress:r.delivery_address??r?.payload?.deliveryAddress??"",customerLatitude:r.customer_latitude??r?.payload?.customerLatitude??null,customerLongitude:r.customer_longitude??r?.payload?.customerLongitude??null,distanceKm:r.distance_km??r?.payload?.distanceKm??null,estimatedTravelTime:r.estimated_travel_time??r?.payload?.estimatedTravelTime??null,deliveryFee:r.delivery_fee??r?.payload?.deliveryFee??0,paymentMethod:r.payment_method??r?.payload?.paymentMethod??"",subtotal:r.subtotal??r?.payload?.subtotal??0,total:r.total??r?.payload?.total??0,status:r.status??r?.payload?.status??0,statusLabel:r.status_label??r?.payload?.statusLabel??"",items:r.items??r?.payload?.items??[],statusHistory:r.status_history??r?.payload?.statusHistory??[],driverId:r.driver_id??r?.payload?.driverId??null,createdAt:r.created_at??r?.payload?.createdAt,updatedAt:r.updated_at});
async function run(fn){const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT_MS);try{return await fn(c.signal)}finally{clearTimeout(t)}}
function retryable(e){return e?.name==="AbortError"||e instanceof TypeError||RETRYABLE.has(Number(e?.status||0))||["53300","57P01","57P02","57P03","57014"].includes(String(e?.code||""))||/network|timeout|connection|failed to fetch/i.test(String(e?.message||""))}
function queue(row){try{localStorage.setItem(PENDING_ORDER_QUEUE_KEY,JSON.stringify([{row,queuedAt:new Date().toISOString()}]))}catch{}}
function unqueue(){try{localStorage.removeItem(PENDING_ORDER_QUEUE_KEY)}catch{}}

export async function listOrders(options={}){
 const mine=staff()?[]:ids(); if(!staff()&&!mine.length)return [];
 return run(async signal=>{let q=requireSupabase().from(TABLE).select("*").order(options.updatedSince?"updated_at":"created_at",{ascending:false}).limit(Math.min(200,Number(options.limit||120))).abortSignal(signal);if(options.branchId)q=q.eq("branch_id",options.branchId);if(options.updatedSince)q=q.gt("updated_at",options.updatedSince);if(!staff())q=q.in("id",mine);const {data,error}=await q;if(error)throw error;return (data||[]).map(fromRow)})
}
export async function getOrder(orderId){if(!staff()&&!ids().includes(String(orderId)))return null;return run(async signal=>{const {data,error}=await requireSupabase().from(TABLE).select("*").eq("id",String(orderId)).maybeSingle().abortSignal(signal);if(error)throw error;return data?fromRow(data):null})}
async function submit(row){return run(async signal=>{const {error}=await requireSupabase().from(TABLE).insert(row).abortSignal(signal);if(error&&String(error.code)!=="23505")throw error})}
export async function createOrder(order){if(createInFlight)return createInFlight;const row=toRow(order);queue(row);const p=(async()=>{try{await submit(row);unqueue();remember(row.id);return fromRow(row)}catch(e){if(!retryable(e)){unqueue();throw e}remember(row.id);return {...fromRow(row),pendingSync:true}}})();createInFlight=p;try{return await p}finally{if(createInFlight===p)createInFlight=null}}
export async function upsertOrder(order){const row=toRow(order);return run(async signal=>{const {error}=await requireSupabase().from(TABLE).upsert(row,{onConflict:"id"}).abortSignal(signal);if(error)throw error;return fromRow(row)})}
export const updateExistingOrder=upsertOrder;
export function cancelPendingOrderRecovery(orderId){try{const x=JSON.parse(localStorage.getItem(PENDING_ORDER_QUEUE_KEY)||"[]");if(String(x?.[0]?.row?.id||"")===String(orderId))unqueue()}catch{}}
function startPoll(){if(pollTimer||!subscribers.size)return;const tick=async()=>{if(!subscribers.size){pollTimer=null;return}if(document.visibilityState==="visible")await Promise.allSettled([...subscribers].map(f=>f({type:"poll"})));pollTimer=setTimeout(tick,window.location.pathname==="/admin"?60000:30000)};pollTimer=setTimeout(tick,30000)}
export function subscribeOrders(fn){if(typeof fn!=="function")return()=>{};subscribers.add(fn);startPoll();return()=>{subscribers.delete(fn);if(!subscribers.size&&pollTimer){clearTimeout(pollTimer);pollTimer=null}}}
export function subscribeOrder(orderId,fn){let active=true,t=null;const tick=async()=>{if(!active)return;try{const o=await getOrder(orderId);if(o)fn?.(o)}catch{}t=setTimeout(tick,30000)};t=setTimeout(tick,30000);return()=>{active=false;if(t)clearTimeout(t)}}

if(typeof window!=="undefined"){setTimeout(async()=>{try{const x=JSON.parse(localStorage.getItem(PENDING_ORDER_QUEUE_KEY)||"[]");const row=x?.[0]?.row;if(row){await submit(row);unqueue();remember(row.id)}}catch{}},5000)}

