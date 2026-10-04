import {expect,it,vi} from 'vitest';
import {restoreActiveSession} from '../transports/ws-multi.js';
import type {SessionManager} from '../session-manager.js';
import {makeSession} from './fixtures.js';
it('rehydrates the saved session and shares concurrent reconnect requests',async()=>{
 let resolve!:(value:{sessionId:string;resumed:boolean})=>void;
 const create=vi.fn(()=>new Promise<{sessionId:string;resumed:boolean}>(r=>resolve=r));
 const manager={create} as unknown as SessionManager;
 const session={...makeSession(),id:'saved',studentId:'child',conceptId:'algebra',originTopicId:'topic'};
 const first=restoreActiveSession(manager,session),second=restoreActiveSession(manager,session);
 expect(create).toHaveBeenCalledTimes(1);expect(create).toHaveBeenCalledWith({studentId:'child',conceptId:'algebra',topicId:'topic',resumeSessionId:'saved'});
 resolve({sessionId:'saved',resumed:true});expect(await first).toEqual(await second);
});
it('allows another attempt after restoration fails',async()=>{
 const create=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({sessionId:'saved',resumed:true});const manager={create} as unknown as SessionManager;
 await expect(restoreActiveSession(manager,makeSession())).rejects.toThrow('offline');
 await expect(restoreActiveSession(manager,makeSession())).resolves.toMatchObject({resumed:true});expect(create).toHaveBeenCalledTimes(2);
});
