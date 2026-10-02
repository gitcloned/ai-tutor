import {initializeApp,getApps} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut} from 'firebase/auth';
function auth(){
  if(!import.meta.env.VITE_FIREBASE_API_KEY)return null;
  const app=getApps()[0]??initializeApp({apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN||'prodigy-tutor.firebaseapp.com',projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID||'prodigy-tutor',appId:import.meta.env.VITE_FIREBASE_APP_ID});
  return getAuth(app);
}
export async function googleLogin(){
  const instance=auth();if(!instance)throw new Error('Google sign-in is not set up yet. Please ask the person setting up Prodigy to connect it.');
  try{
    const result=await signInWithPopup(instance,new GoogleAuthProvider());
    return result.user.getIdToken();
  }catch(error){
    const code=(error as {code?:string}).code;
    if(code==='auth/popup-closed-by-user')throw new Error('Sign-in was closed. Choose Continue with Google to try again.');
    if(code==='auth/popup-blocked')throw new Error('Allow pop-ups for Prodigy, then choose Continue with Google again.');
    if(code==='auth/unauthorized-domain')throw new Error('Google sign-in is not enabled for this address yet. Please ask the person setting up Prodigy.');
    throw new Error('Google sign-in did not complete. Check your connection and try again.');
  }
}
export async function adultToken(){const instance=auth();if(!instance)return null;await instance.authStateReady();return instance.currentUser?.getIdToken()??null;}
export async function googleLogout(){const instance=auth();if(instance)await signOut(instance);}
