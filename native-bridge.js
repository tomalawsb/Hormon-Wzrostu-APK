(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins = cap.Plugins = cap.Plugins || {};
        const getPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const isNativePlatform = () => getPlatform() !== "web";
        const isPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const getPluginHeader = (pluginName) => {
          var _a;
          return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
        };
        const handleError = (err) => win.console.error(err);
        const registeredPlugins = /* @__PURE__ */ new Map();
        const registerPlugin2 = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a, _b;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
              }
            } else if (impl) {
              return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve) => call.then(() => resolve({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
          });
          return proxy;
        };
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      WebPlugin = class {
        constructor() {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          var _a;
          return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          this.listeners[eventName].splice(index, 1);
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
      (function(SystemBarsStyle2) {
        SystemBarsStyle2["Dark"] = "DARK";
        SystemBarsStyle2["Light"] = "LIGHT";
        SystemBarsStyle2["Default"] = "DEFAULT";
      })(SystemBarsStyle || (SystemBarsStyle = {}));
      (function(SystemBarType2) {
        SystemBarType2["StatusBar"] = "StatusBar";
        SystemBarType2["NavigationBar"] = "NavigationBar";
      })(SystemBarType || (SystemBarType = {}));
      SystemBarsPluginWeb = class extends WebPlugin {
        async setStyle() {
          this.unavailable("not available for web");
        }
        async setAnimation() {
          this.unavailable("not available for web");
        }
        async show() {
          this.unavailable("not available for web");
        }
        async hide() {
          this.unavailable("not available for web");
        }
      };
      SystemBars = registerPlugin("SystemBars", {
        web: () => new SystemBarsPluginWeb()
      });
    }
  });

  // node_modules/@capacitor/app/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    AppWeb: () => AppWeb
  });
  var AppWeb;
  var init_web = __esm({
    "node_modules/@capacitor/app/dist/esm/web.js"() {
      init_dist();
      AppWeb = class extends WebPlugin {
        constructor() {
          super();
          this.handleVisibilityChange = () => {
            const data = {
              isActive: document.hidden !== true
            };
            this.notifyListeners("appStateChange", data);
            if (document.hidden) {
              this.notifyListeners("pause", null);
            } else {
              this.notifyListeners("resume", null);
            }
          };
          document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
        }
        exitApp() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getInfo() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getLaunchUrl() {
          return { url: "" };
        }
        async getState() {
          return { isActive: document.hidden !== true };
        }
        async minimizeApp() {
          throw this.unimplemented("Not implemented on web.");
        }
        async toggleBackButtonHandler() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getAppLanguage() {
          return {
            value: navigator.language.split("-")[0].toLowerCase()
          };
        }
      };
    }
  });

  // node_modules/@capacitor/local-notifications/dist/esm/web.js
  var web_exports2 = {};
  __export(web_exports2, {
    LocalNotificationsWeb: () => LocalNotificationsWeb
  });
  var LocalNotificationsWeb;
  var init_web2 = __esm({
    "node_modules/@capacitor/local-notifications/dist/esm/web.js"() {
      init_dist();
      LocalNotificationsWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.pending = [];
          this.deliveredNotifications = [];
          this.hasNotificationSupport = () => {
            if (!("Notification" in window) || !Notification.requestPermission) {
              return false;
            }
            if (Notification.permission !== "granted") {
              try {
                new Notification("");
              } catch (e) {
                if (e instanceof Error && e.name === "TypeError") {
                  return false;
                }
              }
            }
            return true;
          };
        }
        async getDeliveredNotifications() {
          const deliveredSchemas = [];
          for (const notification of this.deliveredNotifications) {
            const deliveredSchema = {
              title: notification.title,
              id: parseInt(notification.tag),
              body: notification.body
            };
            deliveredSchemas.push(deliveredSchema);
          }
          return {
            notifications: deliveredSchemas
          };
        }
        async removeDeliveredNotifications(delivered) {
          for (const toRemove of delivered.notifications) {
            const found = this.deliveredNotifications.find((n) => n.tag === String(toRemove.id));
            found === null || found === void 0 ? void 0 : found.close();
            this.deliveredNotifications = this.deliveredNotifications.filter(() => !found);
          }
        }
        async removeAllDeliveredNotifications() {
          for (const notification of this.deliveredNotifications) {
            notification.close();
          }
          this.deliveredNotifications = [];
        }
        async createChannel() {
          throw this.unimplemented("Not implemented on web.");
        }
        async deleteChannel() {
          throw this.unimplemented("Not implemented on web.");
        }
        async listChannels() {
          throw this.unimplemented("Not implemented on web.");
        }
        async schedule(options) {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          for (const notification of options.notifications) {
            this.sendNotification(notification);
          }
          return {
            notifications: options.notifications.map((notification) => ({
              id: notification.id
            }))
          };
        }
        async getPending() {
          return {
            notifications: this.pending
          };
        }
        async registerActionTypes() {
          throw this.unimplemented("Not implemented on web.");
        }
        async cancel(pending) {
          this.pending = this.pending.filter((notification) => !pending.notifications.find((n) => n.id === notification.id));
        }
        async areEnabled() {
          const { display } = await this.checkPermissions();
          return {
            value: display === "granted"
          };
        }
        async changeExactNotificationSetting() {
          throw this.unimplemented("Not implemented on web.");
        }
        async checkExactNotificationSetting() {
          throw this.unimplemented("Not implemented on web.");
        }
        async requestPermissions() {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const display = this.transformNotificationPermission(await Notification.requestPermission());
          return { display };
        }
        async checkPermissions() {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const display = this.transformNotificationPermission(Notification.permission);
          return { display };
        }
        transformNotificationPermission(permission) {
          switch (permission) {
            case "granted":
              return "granted";
            case "denied":
              return "denied";
            default:
              return "prompt";
          }
        }
        sendPending() {
          var _a;
          const toRemove = [];
          const now = (/* @__PURE__ */ new Date()).getTime();
          for (const notification of this.pending) {
            if (((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) && notification.schedule.at.getTime() <= now) {
              this.buildNotification(notification);
              toRemove.push(notification);
            }
          }
          this.pending = this.pending.filter((notification) => !toRemove.find((n) => n === notification));
        }
        sendNotification(notification) {
          var _a;
          if ((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) {
            const diff = notification.schedule.at.getTime() - (/* @__PURE__ */ new Date()).getTime();
            this.pending.push(notification);
            setTimeout(() => {
              this.sendPending();
            }, diff);
            return;
          }
          this.buildNotification(notification);
        }
        buildNotification(notification) {
          const localNotification = new Notification(notification.title, {
            body: notification.body,
            tag: String(notification.id)
          });
          localNotification.addEventListener("click", this.onClick.bind(this, notification), false);
          localNotification.addEventListener("show", this.onShow.bind(this, notification), false);
          localNotification.addEventListener("close", () => {
            this.deliveredNotifications = this.deliveredNotifications.filter(() => !this);
          }, false);
          this.deliveredNotifications.push(localNotification);
          return localNotification;
        }
        onClick(notification) {
          const data = {
            actionId: "tap",
            notification
          };
          this.notifyListeners("localNotificationActionPerformed", data);
        }
        onShow(notification) {
          this.notifyListeners("localNotificationReceived", notification);
        }
      };
    }
  });

  // src/native/native-bridge.js
  init_dist();

  // node_modules/@capacitor/app/dist/esm/index.js
  init_dist();
  var App = registerPlugin("App", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.AppWeb())
  });

  // node_modules/@capacitor/local-notifications/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/local-notifications/dist/esm/definitions.js
  var Weekday;
  (function(Weekday2) {
    Weekday2[Weekday2["Sunday"] = 1] = "Sunday";
    Weekday2[Weekday2["Monday"] = 2] = "Monday";
    Weekday2[Weekday2["Tuesday"] = 3] = "Tuesday";
    Weekday2[Weekday2["Wednesday"] = 4] = "Wednesday";
    Weekday2[Weekday2["Thursday"] = 5] = "Thursday";
    Weekday2[Weekday2["Friday"] = 6] = "Friday";
    Weekday2[Weekday2["Saturday"] = 7] = "Saturday";
  })(Weekday || (Weekday = {}));

  // node_modules/@capacitor/local-notifications/dist/esm/index.js
  var LocalNotifications = registerPlugin("LocalNotifications", {
    web: () => Promise.resolve().then(() => (init_web2(), web_exports2)).then((m) => new m.LocalNotificationsWeb())
  });

  // src/native/native-bridge.js
  var CHANNEL_ID = "growth-diary-reminders";
  var SOURCE = "growth-diary";
  var SCHEDULE_DAYS = 90;
  var initialized = false;
  var initializing = null;
  function hasAndroidWebViewBridge() {
    return typeof window.AndroidNative === "object" && window.AndroidNative !== null;
  }
  function isNative() {
    return hasAndroidWebViewBridge() || Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  }
  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
  function localDateISO(date = /* @__PURE__ */ new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function parseTime(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
    return match ? [Number(match[1]), Number(match[2])] : [21, 0];
  }
  function stableId(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 1e5 + Math.abs(hash >>> 0) % 19e8;
  }
  async function initialize() {
    if (!isNative()) return false;
    if (initialized) return true;
    if (initializing) return initializing;
    initializing = (async () => {
      if (hasAndroidWebViewBridge()) {
        window.AndroidNative.initialize?.();
        initialized = true;
        return true;
      }
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: "Przypomnienia o zastrzykach",
        description: "Codzienne przypomnienia dla profili dzieci",
        importance: 5,
        visibility: 1,
        vibration: true
      }).catch(() => void 0);
      await App.addListener("backButton", ({ canGoBack }) => {
        emit("nativeBackButton", { canGoBack: Boolean(canGoBack) });
      });
      await App.addListener("resume", () => emit("nativeAppResume"));
      await LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
        emit("nativeNotificationAction", {
          profileId: String(notification?.extra?.profileId || ""),
          date: String(notification?.extra?.date || "")
        });
      });
      initialized = true;
      return true;
    })().finally(() => {
      initializing = null;
    });
    return initializing;
  }
  async function notificationPermission() {
    if (!isNative()) return "unsupported";
    if (hasAndroidWebViewBridge()) return String(window.AndroidNative.notificationPermission?.() || "prompt");
    await initialize();
    const result = await LocalNotifications.checkPermissions();
    return result.display || "prompt";
  }
  async function exactAlarmPermission() {
    if (!isNative()) return "unsupported";
    if (hasAndroidWebViewBridge()) return String(window.AndroidNative.exactAlarmPermission?.() || "granted");
    try {
      await initialize();
      const result = await LocalNotifications.checkExactNotificationSetting();
      return result.exact_alarm || "denied";
    } catch {
      return "denied";
    }
  }
  async function requestExactAlarmPermission() {
    if (!isNative()) return "unsupported";
    if (hasAndroidWebViewBridge()) return String(window.AndroidNative.requestExactAlarmPermission?.() || "granted");
    try {
      await initialize();
      const current = await exactAlarmPermission();
      if (current === "granted") return current;
      const result = await LocalNotifications.changeExactNotificationSetting();
      return result.exact_alarm || "denied";
    } catch {
      return "denied";
    }
  }
  async function requestNotificationPermission() {
    if (!isNative()) return "unsupported";
    if (hasAndroidWebViewBridge()) return requestWebViewPermission("notification");
    await initialize();
    const result = await LocalNotifications.requestPermissions();
    const display = result.display || "prompt";
    if (display === "granted") {
      await requestExactAlarmPermission().catch(() => "denied");
    }
    return display;
  }
  function parseNativeJson(raw, fallback = {}) {
    try {
      const parsed = JSON.parse(String(raw || ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  async function notificationDiagnostics() {
    if (!isNative()) {
      return {
        platform: "web",
        notificationPermission: "unsupported",
        exactAlarmPermission: "unsupported",
        configuredProfiles: 0,
        scheduledProfiles: 0,
        nextTriggerAt: 0,
        scheduleMode: "none"
      };
    }
    if (hasAndroidWebViewBridge()) {
      return parseNativeJson(window.AndroidNative.notificationDiagnostics?.(), {
        platform: "android",
        notificationPermission: "denied",
        exactAlarmPermission: "denied",
        configuredProfiles: 0,
        scheduledProfiles: 0,
        nextTriggerAt: 0,
        scheduleMode: "none"
      });
    }
    await initialize();
    const [permission, exact, pendingResult, channelsResult] = await Promise.all([
      notificationPermission().catch(() => "denied"),
      exactAlarmPermission().catch(() => "denied"),
      LocalNotifications.getPending().catch(() => ({ notifications: [] })),
      LocalNotifications.listChannels().catch(() => ({ channels: [] }))
    ]);
    const notifications = (pendingResult.notifications || []).filter(
      (item) => item.extra?.source === SOURCE && !item.extra?.test
    );
    const profileIds = new Set(notifications.map((item) => String(item.extra?.profileId || "")));
    const nextTriggerAt = notifications.reduce((next, item) => {
      const at = new Date(item.schedule?.at || 0).getTime();
      return Number.isFinite(at) && at > 0 && (!next || at < next) ? at : next;
    }, 0);
    const channel = (channelsResult.channels || []).find((item) => item.id === CHANNEL_ID) || null;
    return {
      platform: "android",
      notificationPermission: permission,
      notificationsEnabled: permission === "granted",
      channelEnabled: !channel || Number(channel.importance) > 0,
      exactAlarmPermission: exact,
      configuredProfiles: profileIds.size,
      scheduledProfiles: profileIds.size,
      nextTriggerAt,
      scheduleMode: notifications.length ? exact === "granted" ? "exact" : "inexact" : "none"
    };
  }
  async function openNotificationSettings() {
    if (!isNative()) return false;
    if (hasAndroidWebViewBridge()) {
      return Boolean(window.AndroidNative.openNotificationSettings?.());
    }
    return false;
  }
  function notificationEventsReady() {
    if (hasAndroidWebViewBridge()) window.AndroidNative.notificationEventsReady?.();
  }
  async function microphonePermission() {
    if (!isNative()) return "unsupported";
    if (hasAndroidWebViewBridge()) return String(window.AndroidNative.microphonePermission?.() || "prompt");
    try {
      if (!navigator.permissions?.query) return navigator.mediaDevices?.getUserMedia ? "prompt" : "unsupported";
      const result = await navigator.permissions.query({ name: "microphone" });
      return result.state || "prompt";
    } catch {
      return navigator.mediaDevices?.getUserMedia ? "prompt" : "unsupported";
    }
  }
  function requestWebViewPermission(kind) {
    return new Promise((resolve) => {
      const eventName = "nativePermissionChanged";
      const timeout = window.setTimeout(() => {
        window.removeEventListener(eventName, listener);
        const fallback = kind === "microphone" ? window.AndroidNative.microphonePermission?.() : window.AndroidNative.notificationPermission?.();
        resolve(String(fallback || "denied"));
      }, 12e3);
      const listener = (event) => {
        if (String(event.detail?.kind || "") !== kind) return;
        window.clearTimeout(timeout);
        window.removeEventListener(eventName, listener);
        resolve(String(event.detail?.state || "denied"));
      };
      window.addEventListener(eventName, listener);
      if (kind === "microphone") window.AndroidNative.requestMicrophonePermission?.();
      else window.AndroidNative.requestNotificationPermission?.();
    });
  }
  async function requestMicrophonePermission() {
    if (!isNative()) return "unsupported";
    if (hasAndroidWebViewBridge()) return requestWebViewPermission("microphone");
    try {
      if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return "granted";
    } catch {
      return "denied";
    }
  }
  async function cancelDiaryNotifications() {
    const pending = await LocalNotifications.getPending();
    const notifications = (pending.notifications || []).filter((item) => item.extra?.source === SOURCE);
    if (notifications.length) {
      await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
    }
  }
  function makeScheduledNotification(profile, at, dateISO) {
    return {
      id: stableId(`${profile.profileId}:${dateISO}`),
      title: `Czas na zastrzyk \u2014 ${profile.profileName}`,
      body: profile.body || `${profile.profileName}: otw\xF3rz aplikacj\u0119 i zapisz podanie.`,
      channelId: CHANNEL_ID,
      smallIcon: "ic_stat_notify",
      schedule: { at, allowWhileIdle: true },
      extra: {
        source: SOURCE,
        profileId: profile.profileId,
        date: dateISO,
        url: "./#today"
      }
    };
  }
  async function syncDailyReminders(profiles = []) {
    if (!isNative()) return { scheduled: 0 };
    if (hasAndroidWebViewBridge()) {
      const scheduled = Number(window.AndroidNative.syncDailyReminders?.(JSON.stringify(profiles)) || 0);
      return { scheduled };
    }
    await initialize();
    await cancelDiaryNotifications();
    if (await notificationPermission() !== "granted") return { scheduled: 0 };
    const deliveredResult = await LocalNotifications.getDeliveredNotifications().catch(() => ({ notifications: [] }));
    const delivered = (deliveredResult.notifications || []).filter((item) => item.extra?.source === SOURCE && !item.extra?.test);
    const deliveredKeys = new Set(delivered.map((item) => `${item.extra?.profileId || ""}:${item.extra?.date || ""}`));
    const profileById = new Map(profiles.map((profile) => [profile.profileId, profile]));
    const toRemove = delivered.filter((item) => {
      const profile = profileById.get(item.extra?.profileId || "");
      return !profile || profile.todayHasEntry;
    });
    if (toRemove.length) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: toRemove }).catch(() => void 0);
    }
    const now = /* @__PURE__ */ new Date();
    const todayISO = localDateISO(now);
    const notifications = [];
    for (const profile of profiles) {
      if (!profile?.profileId || !profile.enabled) continue;
      const [hour, minute] = parseTime(profile.time);
      for (let offset = 0; offset < SCHEDULE_DAYS; offset += 1) {
        const at = new Date(now);
        at.setDate(now.getDate() + offset);
        at.setHours(hour, minute, 0, 0);
        const dateISO = localDateISO(at);
        if (offset === 0 && (profile.todayHasEntry || profile.lastReminderDate === todayISO || deliveredKeys.has(`${profile.profileId}:${todayISO}`))) continue;
        if (offset === 0 && at <= now) at.setTime(now.getTime() + 3e3);
        notifications.push(makeScheduledNotification(profile, at, dateISO));
      }
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
    return { scheduled: notifications.length };
  }
  async function showNotification({ title, body, profileId = "", test = false } = {}) {
    if (!isNative()) return false;
    if (hasAndroidWebViewBridge()) {
      return Boolean(window.AndroidNative.showNotification?.(JSON.stringify({ title, body, profileId, test })));
    }
    await initialize();
    if (await notificationPermission() !== "granted") return false;
    const dateISO = localDateISO();
    await LocalNotifications.schedule({
      notifications: [{
        id: stableId(`${test ? "test" : "now"}:${profileId}:${Date.now()}`),
        title: title || "Dzienniczek Hormonu",
        body: body || "Otw\xF3rz aplikacj\u0119.",
        channelId: CHANNEL_ID,
        smallIcon: "ic_stat_notify",
        schedule: { at: new Date(Date.now() + 250) },
        extra: { source: SOURCE, profileId, date: dateISO, url: "./#today", test: Boolean(test) }
      }]
    });
    return true;
  }
  function parseNativeSecurityResult(raw, fallbackError = "security_error") {
    try {
      const parsed = JSON.parse(String(raw || ""));
      return parsed && typeof parsed === "object" ? parsed : { ok: false, error: fallbackError };
    } catch {
      return { ok: false, error: fallbackError };
    }
  }
  function secureStorageType() {
    if (!hasAndroidWebViewBridge()) return "unsupported";
    return String(window.AndroidNative.secureStorageType?.() || "unsupported");
  }
  function secureStorageRead(slot) {
    if (!hasAndroidWebViewBridge()) return { ok: false, exists: false, error: "unsupported" };
    return parseNativeSecurityResult(window.AndroidNative.secureStorageRead?.(String(slot || "")));
  }
  function secureStorageWrite(slot, value) {
    if (!hasAndroidWebViewBridge()) return false;
    return Boolean(
      window.AndroidNative.secureStorageWrite?.(String(slot || ""), String(value ?? ""))
    );
  }
  function secureStorageRemove(slot) {
    if (!hasAndroidWebViewBridge()) return false;
    return Boolean(window.AndroidNative.secureStorageRemove?.(String(slot || "")));
  }
  function randomBase64(byteCount = 16) {
    if (!hasAndroidWebViewBridge()) return "";
    return String(window.AndroidNative.randomBase64?.(Number(byteCount) || 16) || "");
  }
  function pinHash(pin, saltBase64) {
    if (!hasAndroidWebViewBridge()) return "";
    return String(window.AndroidNative.pinHash?.(String(pin || ""), String(saltBase64 || "")) || "");
  }
  function encryptBackup(plaintext, password) {
    if (!hasAndroidWebViewBridge()) return { ok: false, error: "unsupported" };
    return parseNativeSecurityResult(
      window.AndroidNative.encryptBackup?.(String(plaintext || ""), String(password || "")),
      "encryption_failed"
    );
  }
  function decryptBackup(envelope, password) {
    if (!hasAndroidWebViewBridge()) return { ok: false, error: "unsupported" };
    return parseNativeSecurityResult(
      window.AndroidNative.decryptBackup?.(String(envelope || ""), String(password || "")),
      "decryption_failed"
    );
  }
  function biometricStatus() {
    if (!hasAndroidWebViewBridge()) return "unsupported";
    return String(window.AndroidNative.biometricStatus?.() || "unavailable");
  }
  function requestBiometricUnlock() {
    if (!hasAndroidWebViewBridge() || biometricStatus() !== "available") {
      return Promise.resolve({ success: false, state: "unavailable" });
    }
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("nativeBiometricResult", listener);
        resolve({ success: false, state: "timeout" });
      }, 6e4);
      const listener = (event) => {
        window.clearTimeout(timeout);
        window.removeEventListener("nativeBiometricResult", listener);
        resolve({
          success: Boolean(event.detail?.success),
          state: String(event.detail?.state || "cancelled")
        });
      };
      window.addEventListener("nativeBiometricResult", listener);
      window.AndroidNative.requestBiometricUnlock?.();
    });
  }
  function saveJsonFile(filename, content) {
    if (!hasAndroidWebViewBridge()) {
      return Promise.resolve({ success: false, state: "unsupported" });
    }
    return new Promise((resolve) => {
      const eventName = "nativeFileSaveResult";
      const timeout = window.setTimeout(() => {
        window.removeEventListener(eventName, listener);
        resolve({ success: false, state: "timeout" });
      }, 12e4);
      const listener = (event) => {
        window.clearTimeout(timeout);
        window.removeEventListener(eventName, listener);
        resolve({
          success: Boolean(event.detail?.success),
          state: String(event.detail?.state || "unknown")
        });
      };
      window.addEventListener(eventName, listener);
      const started = Boolean(
        window.AndroidNative.saveJsonFile?.(String(filename || ""), String(content ?? ""))
      );
      if (!started) {
        window.clearTimeout(timeout);
        window.removeEventListener(eventName, listener);
        resolve({ success: false, state: "not_started" });
      }
    });
  }
  function isAllowedUpdateApkUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port) return false;
      if (url.username || url.password || url.search || url.hash) return false;
      const prefix = "/tomalawsb/Hormon-Wzrostu-APK/releases/download/";
      if (!url.pathname.startsWith(prefix)) return false;
      const parts = url.pathname.slice(prefix.length).split("/");
      return parts.length === 2 && Boolean(parts[0]) && /^[^/]+\.apk$/i.test(parts[1]);
    } catch {
      return false;
    }
  }
  async function openExternal(url) {
    const value = String(url || "").trim();
    if (!isAllowedUpdateApkUrl(value)) return false;
    if (hasAndroidWebViewBridge()) {
      return Boolean(window.AndroidNative.openExternalUrl?.(value));
    }
    const opened = window.open(value, "_blank", "noopener,noreferrer");
    return Boolean(opened);
  }
  async function exitApp() {
    if (hasAndroidWebViewBridge()) {
      window.AndroidNative.exitApp?.();
      return;
    }
    if (isNative()) await App.exitApp();
  }
  var bridge = {
    isNative: isNative(),
    platform: hasAndroidWebViewBridge() ? "android" : Capacitor.getPlatform(),
    initialize,
    microphonePermission,
    requestMicrophonePermission,
    notificationPermission,
    requestNotificationPermission,
    exactAlarmPermission,
    requestExactAlarmPermission,
    notificationDiagnostics,
    openNotificationSettings,
    notificationEventsReady,
    syncDailyReminders,
    showNotification,
    secureStorageType,
    secureStorageRead,
    secureStorageWrite,
    secureStorageRemove,
    randomBase64,
    pinHash,
    encryptBackup,
    decryptBackup,
    biometricStatus,
    requestBiometricUnlock,
    saveJsonFile,
    openExternal,
    exitApp
  };
  window.NativeBridge = bridge;
  initialize().catch((error) => console.warn("Nie uda\u0142o si\u0119 uruchomi\u0107 mostu Android:", error));
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
