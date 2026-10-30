/** Statuses reflect what has been verified, not what an image model might infer. */
export const capabilities=Object.freeze({
 text:{status:'composite',roundTrip:'legacy'},image:{status:'composite',roundTrip:'legacy'},rect:{status:'composite',roundTrip:'legacy'},ellipse:{status:'composite',roundTrip:'legacy'},circle:{status:'composite',roundTrip:'legacy'},line:{status:'composite',roundTrip:'legacy'},svg:{status:'composite',roundTrip:'legacy'},path:{status:'composite',roundTrip:'legacy'},
 group:{status:'unsupported',reason:'GROUP_HIERARCHY_NOT_ROUNDTRIPPED'},symbolInstance:{status:'unsupported',reason:'SYMBOL_INSTANCE_NOT_ROUNDTRIPPED'},brushStroke:{status:'unsupported',reason:'BRUSH_NOT_ROUNDTRIPPED'},richText:{status:'unsupported',reason:'RICH_TEXT_NOT_ROUNDTRIPPED'},textOnPath:{status:'unsupported',reason:'TEXT_ON_PATH_NOT_ROUNDTRIPPED'},qr:{status:'unsupported',reason:'QR_ADAPTER_MISSING'},table:{status:'unsupported',reason:'TABLE_ADAPTER_MISSING'},chart:{status:'unsupported',reason:'CHART_ADAPTER_MISSING'}
});
export function capability(type){return capabilities[type]||{status:'unsupported',reason:'UNREGISTERED_TYPE'};}
export function unsupportedNodes(doc){return Object.values(doc.nodes||{}).filter(n=>capability(n.type).status==='unsupported').map(n=>({id:n.id,type:n.type,code:capability(n.type).reason}));}
