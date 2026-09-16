export function defaultTutorUrl(location:Pick<Location,'protocol'|'hostname'>) {
  return `${location.protocol==='https:'?'wss':'ws'}://${location.hostname}:32004`;
}

export function initialTutorUrl(location:Pick<Location,'protocol'|'hostname'>,saved:string|null) {
  const fallback=defaultTutorUrl(location);
  if(saved) {
    try {
      const parsed=new URL(saved);
      // Keep a custom port/path for this host, but never reuse another host's
      // address (especially localhost when opening the canvas over the LAN).
      if(parsed.hostname===location.hostname&&parsed.protocol===new URL(fallback).protocol)return saved;
    } catch { /* Replace an invalid saved address with the site-derived default. */ }
  }
  return fallback;
}
