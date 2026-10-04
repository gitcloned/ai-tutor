import {expect,it,vi} from 'vitest';
vi.mock('../src/journey/api',()=>({request:vi.fn()}));
import {request} from '../src/journey/api';
import {getHome} from '../src/journey/learning';
function setup(resumeSessionId:string|null,status='in_progress'){
 const next={status:'continue',topicId:'topic',conceptId:'concept',conceptTitle:'Solving equations',state:'learning',resumeSessionId};
 const home={subjects:[{subjectId:'math',title:'Mathematics',topics:[{topicId:'topic',title:'Algebra',status}]}],continueWith:next};
 vi.mocked(request).mockReset();vi.mocked(request).mockImplementation(async(path)=>path.endsWith('/home')?home:next);
}
it('shows the resumable concept separately from the topic',async()=>{
 setup('session');const home=await getHome('student');
 expect(home.continueWith?.conceptTitle).toBe('Solving equations');expect(home.subjects[0].topics[0].next?.state).toBe('learning');
});
it('has no resume card without a resumable session, while keeping topic continuation',async()=>{
 setup(null);const home=await getHome('student');expect(home.continueWith).toBeNull();expect(home.subjects[0].topics[0].next?.conceptId).toBe('concept');
});
it('keeps untouched topics as not started without fetching a continuation',async()=>{
 setup(null,'not_started');const home=await getHome('student');expect(home.subjects[0].topics[0].status).toBe('not_started');expect(home.subjects[0].topics[0].next).toBeUndefined();expect(request).toHaveBeenCalledTimes(1);
});
it('does not offer continuation if the backend cannot resolve the next concept',async()=>{
 setup(null);vi.mocked(request).mockImplementationOnce(async()=>({subjects:[{subjectId:'math',title:'Math',topics:[{topicId:'topic',title:'Algebra',status:'in_progress'}]}],continueWith:null})).mockResolvedValueOnce({status:'unavailable',reason:'Not ready'});
 const home=await getHome('student');expect(home.subjects[0].topics[0].status).toBe('unavailable');expect(home.subjects[0].topics[0].next).toBeUndefined();
});
