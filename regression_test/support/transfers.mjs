import {core} from './client.mjs';
export async function createTransfer(ctx,source,ttl=3600){return core(ctx,'POST','/v1/transfers',{expiresInSeconds:ttl,items:[source]},{capture:false});}
export async function receiveTransfer(ctx,capability,options={}){return core(ctx,'POST','/v1/transfers/receive',{capability},{...options,capture:false});}
export async function revokeTransfer(ctx,id){return core(ctx,'POST','/v1/transfers/revoke',{transferId:id},{capture:false});}
