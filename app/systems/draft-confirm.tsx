'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';

type Confirm = (message:string)=>Promise<boolean>;
// A detached component must fail closed, never silently discard a draft.
const DraftConfirmContext=createContext<Confirm>(async()=>false);
export const useDraftConfirm=()=>useContext(DraftConfirmContext);

export function DraftConfirmProvider({children}:{children:ReactNode}){
 const [message,setMessage]=useState<string|null>(null);
 const pending=useRef<((accepted:boolean)=>void)|null>(null);
 const opener=useRef<HTMLElement|null>(null);
 const fallback=useRef<HTMLElement|null>(null);
 const decision=useRef<boolean|null>(null);
 const confirm=useCallback<Confirm>((text)=>{
  if(pending.current)return Promise.resolve(false);
  opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  fallback.current=opener.current?.closest('section,article')?.querySelector<HTMLElement>('textarea,input,select,[tabindex]')??document.getElementById('systems-main');
  decision.current=null;
  return new Promise<boolean>(resolve=>{pending.current=resolve;setMessage(text)});
 },[]);
 const finish=useCallback((accepted:boolean)=>{
  if(decision.current!==null)return;
  decision.current=accepted;setMessage(null);
 },[]);
 useEffect(()=>()=>{pending.current?.(false);pending.current=null},[]);
 return <DraftConfirmContext.Provider value={confirm}>{children}
  <AlertDialog open={message!==null} onOpenChange={open=>{if(!open)finish(false)}}>
   <AlertDialogContent className="sys-draft-confirm" onCloseAutoFocus={event=>{
    event.preventDefault();
    const accepted=decision.current??false,resolve=pending.current;
    pending.current=null;decision.current=null;
    if(!accepted&&opener.current?.isConnected)opener.current.focus();
    resolve?.(accepted);
    requestAnimationFrame(()=>{if(accepted&&(document.activeElement===document.body||document.activeElement===opener.current)&&fallback.current?.isConnected)fallback.current.focus()});
   }}>
    <AlertDialogHeader><AlertDialogTitle>确认处理未保存内容</AlertDialogTitle><AlertDialogDescription>{message}</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel className="sys-draft-confirm-cancel" onClick={()=>finish(false)}>保留当前输入</AlertDialogCancel><AlertDialogAction className="sys-draft-confirm-accept" onClick={()=>finish(true)}>确认继续</AlertDialogAction></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </DraftConfirmContext.Provider>
}
