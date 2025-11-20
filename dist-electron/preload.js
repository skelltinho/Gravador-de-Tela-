"use strict";const{contextBridge:o,ipcRenderer:t}=require("electron");o.exposeInMainWorld("api",{getStoreValue:e=>t.invoke("getStoreValue",e),setStoreValue:(e,r)=>t.invoke("setStoreValue",e,r)});
