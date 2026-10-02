import {randomBytes,createHash} from 'node:crypto';
import {Schema,model} from 'mongoose';
const sessions=model('AccessSession',new Schema({tokenHash:{type:String,unique:true},kind:String,subjectId:String,expiresAt:{type:Date,index:{expires:0}}}));
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function issueToken(kind:'student'|'adult',subjectId:string){const token=randomBytes(32).toString('base64url');await sessions.create({tokenHash:hash(token),kind,subjectId,expiresAt:new Date(Date.now()+7*86400000)});return token;}
export async function identityForToken(token:string){return sessions.findOne({tokenHash:hash(token),expiresAt:{$gt:new Date()}}).lean();}
export async function revokeToken(token:string){await sessions.deleteOne({tokenHash:hash(token)});}
