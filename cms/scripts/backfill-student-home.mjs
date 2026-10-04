// Targeted legacy-parent repair. Dry-run by default; --write requires --backup=PATH.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(new URL('../packages/backend/package.json',import.meta.url));
const mongoose=require('mongoose');
const studentId=process.argv.find(a=>a.startsWith('--student='))?.slice(10);
const backup=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);
const write=process.argv.includes('--write');
if(!studentId||write&&!backup)throw new Error('Provide --student=ID; writes also require --backup=PATH');
await mongoose.connect(`${process.env.MONGO_URL??'mongodb://localhost:27017'}/${process.env.DB_NAME??'prodigy'}`);
try{
const db=mongoose.connection.db,newId=()=>new mongoose.Types.ObjectId().toHexString();
const student=await db.collection('students').findOne({id:studentId});
if(!student)throw new Error('Student not found');
const owner=await db.collection('users').findOne({id:student.createdByUserId});
if(owner?.roles?.length!==1||owner.roles[0]!=='parent')throw new Error('Ambiguous ownership: automatic personal-class repair skipped');
const journeys=await db.collection('learning_journeys').find({studentId}).toArray();
if(journeys.length!==1)throw new Error('Requires exactly one legacy journey');
const journey=journeys[0];
const nodes=await db.collection('learning_journey_nodes').find({journeyId:journey.id}).toArray();
if(!nodes.length)throw new Error('No existing progress to map');
const links=[];
for(const node of nodes){
const concept=await db.collection('concepts').findOne({id:node.conceptId});
const topic=await db.collection('topics').findOne({id:String(concept?.topic)});
const unit=await db.collection('units').findOne({id:String(topic?.unit)});
const strand=await db.collection('strands').findOne({id:String(unit?.strand)});
if(!topic||!strand?.subject)throw new Error(`Broken curriculum for ${node.conceptId}`);
links.push({node,topic,strand});
}
if(new Set(links.map(l=>l.strand.subject)).size!==1)throw new Error('Multiple subjects need reviewed migration');
const title=links[0].strand.subject;
const existingSubject=await db.collection('subjects').findOne({title});
const declaredIds=[...new Set(links.map(l=>l.strand.subjectId).filter(Boolean))];
if(declaredIds.length>1)throw new Error('Conflicting subject identities');
const subjectId=existingSubject?.id??declaredIds[0]??newId();
if(journey.subjectId&&journey.subjectId!==subjectId)throw new Error('Journey subject conflicts with curriculum');
const classes=await db.collection('classrooms').find({personalStudentId:studentId,kind:'personal'}).toArray();
if(classes.length>1)throw new Error('Duplicate personal classes');
const classroomId=classes[0]?.id??newId();
const topics=[...new Set(links.map(l=>l.topic.id))];
const sessions=await db.collection('sessions').find({journeyNodeId:{$in:nodes.map(n=>n.id)}}).toArray();
console.log(JSON.stringify({mode:write?'write':'dry-run',studentId,journeyId:journey.id,subject:title,subjectId,createPersonalClass:!classes.length,topics,nodes:nodes.length,sessions:sessions.length,preserveSessionStatuses:true},null,2));
if(write){
const snapshot={studentId,journeys,nodes,sessions,subjects:existingSubject?[existingSubject]:[],strands:[...new Map(links.map(l=>[l.strand.id,l.strand])).values()],classes,enrollments:await db.collection('enrollments').find({studentId}).toArray(),classAssignments:await db.collection('class_assignments').find({classroomId}).toArray(),journeyTopics:await db.collection('learning_journey_topics').find({journeyId:journey.id}).toArray(),plannedIds:{subjectId,classroomId}};
writeFileSync(backup,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
const now=new Date();
await db.collection('subjects').updateOne({id:subjectId},{$setOnInsert:{id:subjectId,title}},{upsert:true});
for(const strand of snapshot.strands)await db.collection('strands').updateOne({_id:strand._id},{$set:{subjectId}});
await db.collection('learning_journeys').updateOne({_id:journey._id},{$set:{subjectId}});
await db.collection('classrooms').updateOne({id:classroomId},{$setOnInsert:{id:classroomId,name:`${student.name}'s learning`,ownerUserId:owner.id,personalStudentId:studentId,kind:'personal',grade:student.grade,subject:title,status:'active',createdAt:now,hashedClassCode:null}},{upsert:true});
await db.collection('enrollments').updateOne({studentId,classroomId},{$setOnInsert:{studentId,classroomId,joinedAt:now}},{upsert:true});
for(const topicId of topics){
await db.collection('class_assignments').updateOne({classroomId,topicId},{$setOnInsert:{id:newId(),classroomId,topicId,subjectId,createdAt:now}},{upsert:true});
await db.collection('learning_journey_topics').updateOne({journeyId:journey.id,topicId},{$setOnInsert:{id:newId(),journeyId:journey.id,topicId,assignedAt:now},$addToSet:{sourceClassIds:classroomId}},{upsert:true});
}
for(const {node,topic} of links){
const related=sessions.filter(s=>s.journeyNodeId===node.id);
const dates=related.flatMap(s=>[s.createdAt,s.updatedAt,...(s.history??[]).map(m=>m.timestamp)]).map(d=>new Date(d).getTime()).filter(Number.isFinite);
await db.collection('learning_journey_nodes').updateOne({_id:node._id},{$set:{topicId:topic.id,...(!node.lastActivity&&dates.length?{lastActivity:new Date(Math.max(...dates))}:{})}});
for(const session of related)if(!session.originTopicId)await db.collection('sessions').updateOne({_id:session._id},{$set:{originTopicId:topic.id}});
}
console.log('Backfill applied; backup saved.');
}
}finally{await mongoose.disconnect();}
