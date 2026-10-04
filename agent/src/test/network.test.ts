import {it,expect,vi} from 'vitest';
import {requestBeforeOutput,serviceError} from '../network.js';
it('retries transient request failures before output, with bounded attempts',async()=>{
 const request=vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue('stream');
 const sleep=vi.fn().mockResolvedValue(undefined);
 expect(await requestBeforeOutput('Gemini',request,sleep)).toBe('stream');expect(request).toHaveBeenCalledTimes(2);
 request.mockReset().mockRejectedValue(new TypeError('fetch failed'));
 await expect(requestBeforeOutput('Gemini',request,sleep)).rejects.toThrow('Gemini: fetch failed');expect(request).toHaveBeenCalledTimes(3);
});
it('does not retry authentication failures and preserves the network cause',async()=>{
 const request=vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'),{status:401}));
 await expect(requestBeforeOutput('Gemini',request)).rejects.toThrow('Gemini: Unauthorized');expect(request).toHaveBeenCalledTimes(1);
 expect(serviceError('CMS GET /concepts/example',new TypeError('fetch failed',{cause:{code:'ECONNREFUSED'}})).message).toContain('ECONNREFUSED');
});
