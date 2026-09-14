"use client";
import { fetchLocal } from "@/lib/local-fetch";
import { useEffect, useRef, useState } from "react";
import { QrCode, RefreshCw, Play, Check } from "lucide-react";

export function LocalSearchLogin({onSave,saving}:{onSave:()=>void;saving:boolean}) {
  const [status,setStatus]=useState<{connected:boolean;loggedIn:boolean;username?:string}>({connected:false,loggedIn:false});
  const [qr,setQR]=useState<{image:string;expires:number}|null>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const active=useRef<AbortController|null>(null);
  const run=async(action:"start"|"status"|"qrcode")=>{
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(action);setError("");setNotice("");
    try {
      const response=await fetchLocal("/api/search/login",{method:"POST",retryRead:action==="status",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"本地服务尚未就绪");
      controller.signal.throwIfAborted();
      if(action==="start"){setNotice(data.message);return;}
      setStatus({connected:true,loggedIn:data.loggedIn===true,username:data.username});
      if(data.loggedIn){setQR(null);setNotice("登录成功，可以保存并开始站内搜索。");}
      else if(data.qr)setQR({image:data.qr,expires:data.expiresAt});
      else if(action==="status")setNotice("尚未登录，请使用小红书 App 扫码并确认。");
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:"无法连接本地服务");}
    finally {if(active.current===controller){active.current=null;setBusy("");}}
  };
  useEffect(()=>{void run("status");return()=>{active.current?.abort();active.current=null;};},[]);
  useEffect(()=>{
    if(!qr)return;
    const interval=setInterval(()=>{
      if(Date.now()>=qr.expires){setQR(null);setNotice("二维码已过期，请重新获取。");return;}
      void run("status");
    },12000);
    return()=>clearInterval(interval);
  },[qr]);
  return <section className="local-search-login" aria-label="小红书扫码登录">
    <div className="search-provider"><strong>小红书站内</strong><span>{status.loggedIn ? `已登录${status.username?` · ${status.username}`:""}` : status.connected ? "等待扫码" : "本地服务"}</span></div>
    <p className="search-settings-description">搜索站内笔记，查看封面、作者和正文。首次使用需用小红书 App 扫码；登录状态保存在本机。</p>
    {qr && <div className="xhs-login-qr"><img src={qr.image} alt="小红书登录二维码"/><span>打开小红书 App 扫码，并在手机确认登录</span></div>}
    {error && <p role="alert" className="ai-error">{error}</p>}
    {(notice || busy) && <p role="status" className="search-settings-description">{busy === "qrcode" ? "正在获取二维码…" : busy === "status" ? "正在检查登录…" : busy === "start" ? "正在启动本地服务…" : notice}</p>}
    <div className="xhs-login-actions">
      {!status.connected && <button type="button" className="secondary-button" disabled={!!busy||saving} onClick={()=>void run("start")}><Play size={14}/>启动本地服务</button>}
      {!status.loggedIn && <button type="button" className="primary-button" disabled={!!busy||saving} onClick={()=>void run("qrcode")}><QrCode size={14}/>{qr?"刷新二维码":"扫码登录"}</button>}
      <button type="button" className="secondary-button" disabled={!!busy||saving} onClick={()=>void run("status")}><RefreshCw size={14}/>检查登录</button>
      <button type="button" className="primary-button" disabled={!status.loggedIn||!!busy||saving} onClick={onSave}><Check size={14}/>{saving?"保存中…":"保存并使用"}</button>
    </div>
  </section>;
}
