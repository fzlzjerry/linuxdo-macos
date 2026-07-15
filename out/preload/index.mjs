import { contextBridge, ipcRenderer } from "electron";
const IPC = {
  discourseRequest: "discourse:request",
  authGetState: "auth:getState",
  authShowLogin: "auth:showLogin",
  authLogout: "auth:logout",
  authChanged: "auth:changed",
  // main -> renderer push
  openExternal: "app:openExternal",
  windowControls: "app:windowControls"
};
const api = {
  discourse: {
    request(req) {
      return ipcRenderer.invoke(IPC.discourseRequest, req);
    }
  },
  auth: {
    getState() {
      return ipcRenderer.invoke(IPC.authGetState);
    },
    showLogin() {
      return ipcRenderer.invoke(IPC.authShowLogin);
    },
    logout() {
      return ipcRenderer.invoke(IPC.authLogout);
    },
    onChanged(cb) {
      const listener = (_e, s) => cb(s);
      ipcRenderer.on(IPC.authChanged, listener);
      return () => ipcRenderer.removeListener(IPC.authChanged, listener);
    }
  },
  openExternal(url) {
    return ipcRenderer.invoke(IPC.openExternal, url);
  },
  window: {
    control(action) {
      ipcRenderer.send(IPC.windowControls, action);
    }
  }
};
contextBridge.exposeInMainWorld("api", api);
