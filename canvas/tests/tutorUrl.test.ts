import {afterEach,expect,it,vi} from 'vitest';
import {defaultTutorUrl,initialTutorUrl,normalizeTutorUrl} from '../src/tutorUrl';
afterEach(()=>vi.unstubAllEnvs());
const hosted={protocol:'https:',hostname:'prodigy-tutor.web.app'};
it('accepts copied tunnel links and preserves their path and query',()=>{
  expect(normalizeTutorUrl(' https://tutor.example.com/lesson?id=4 ','https:')).toBe('wss://tutor.example.com/lesson?id=4');
  expect(()=>normalizeTutorUrl('http://tutor.example.com','https:')).toThrow('wss://');
});
it('does not invent a tutor server on the static hosting domain',()=>{
  vi.stubEnv('PROD',true);vi.stubEnv('VITE_TUTOR_WS_URL','');
  expect(defaultTutorUrl(hosted)).toBe('');
  expect(initialTutorUrl(hosted,'ws://localhost:32004')).toBe('');
  expect(initialTutorUrl(hosted,'wss://tutor.example.com/session')).toBe('wss://tutor.example.com/session');
});
it('uses a configured public tutor and rejects insecure production addresses on HTTPS',()=>{
  vi.stubEnv('PROD',true);vi.stubEnv('VITE_TUTOR_WS_URL','wss://tutor.example.com');
  expect(defaultTutorUrl(hosted)).toBe('wss://tutor.example.com');
  vi.stubEnv('VITE_TUTOR_WS_URL','ws://tutor.example.com');expect(defaultTutorUrl(hosted)).toBe('');
});
it('keeps local development addresses tied to the opened site hostname',()=>{
  vi.stubEnv('PROD',false);vi.stubEnv('VITE_TUTOR_WS_URL','');
  const local={protocol:'http:',hostname:'192.168.1.7'};
  expect(defaultTutorUrl(local)).toBe('ws://192.168.1.7:32004');
  expect(initialTutorUrl(local,'ws://localhost:32004')).toBe('ws://192.168.1.7:32004');
});
