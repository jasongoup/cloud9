"no use strict";

var console = {
    log: function() {
        var msgs = Array.prototype.slice.call(arguments, 0);
        postMessage({type: "log", data: msgs});
    },
    error: function() {
        var msgs = Array.prototype.slice.call(arguments, 0);
        postMessage({type: "log", data: msgs});
    }
};
var window = {
    console: console
};

var normalizeModule = function(parentId, moduleName) {
    // normalize plugin requires
    if (moduleName.indexOf("!") !== -1) {
        var chunks = moduleName.split("!");
        return normalizeModule(parentId, chunks[0]) + "!" + normalizeModule(parentId, chunks[1]);
    }
    // normalize relative requires
    if (moduleName.charAt(0) == ".") {
        var base = parentId.split("/").slice(0, -1).join("/");
        var moduleName = base + "/" + moduleName;
        
        while(moduleName.indexOf(".") !== -1 && previous != moduleName) {
            var previous = moduleName;
            var moduleName = moduleName.replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
        }
    }
    
    return moduleName;
};

var require = function(parentId, id) {
    if (!id.charAt)
        throw new Error("worker.js require() accepts only (parentId, id) as arguments");

    var id = normalizeModule(parentId, id);
    
    var module = require.modules[id];
    if (module) {
        if (!module.initialized) {
            module.initialized = true;
            module.exports = module.factory().exports;
        }
        return module.exports;
    }
    
    var chunks = id.split("/");
    chunks[0] = require.tlns[chunks[0]] || chunks[0];
    var path = chunks.join("/") + ".js";
    
    require.id = id;
    importScripts(path);
    return require(parentId, id);    
};

require.modules = {};
require.tlns = {};

var define = function(id, deps, factory) {
    if (arguments.length == 2) {
        factory = deps;
        if (typeof id != "string") {
            deps = id;
            id = require.id;
        }
    } else if (arguments.length == 1) {
        factory = id;
        id = require.id;
    }

    if (id.indexOf("text!") === 0) 
        return;
    
    var req = function(deps, factory) {
        return require(id, deps, factory);
    };

    require.modules[id] = {
        factory: function() {
            var module = {
                exports: {}
            };
            var returnExports = factory(req, module.exports, module);
            if (returnExports)
                module.exports = returnExports;
            return module;
        }
    };
};

function initBaseUrls(topLevelNamespaces) {
    require.tlns = topLevelNamespaces;
}

function initSender() {

    var EventEmitter = require(null, "ace/lib/event_emitter").EventEmitter;
    var oop = require(null, "ace/lib/oop");
    
    var Sender = function() {};
    
    (function() {
        
        oop.implement(this, EventEmitter);
                
        this.callback = function(data, callbackId) {
            postMessage({
                type: "call",
                id: callbackId,
                data: data
            });
        };
    
        this.emit = function(name, data) {
            postMessage({
                type: "event",
                name: name,
                data: data
            });
        };
        
    }).call(Sender.prototype);
    
    return new Sender();
}

var main;
var sender;

onmessage = function(e) {
    var msg = e.data;
    if (msg.command) {
        if (main[msg.command])
            main[msg.command].apply(main, msg.args);
        else
            throw new Error("Unknown command:" + msg.command);
    }
    else if (msg.init) {        
        initBaseUrls(msg.tlns);
        require(null, "ace/lib/fixoldbrowsers");
        sender = initSender();
        var clazz = require(null, msg.module)[msg.classname];
        main = new clazz(sender);
    } 
    else if (msg.event && sender) {
        sender._emit(msg.event, msg.data);
    }
};
// vim:set ts=4 sts=4 sw=4 st:

define('ace/lib/fixoldbrowsers', ['require', 'exports', 'module' , 'ace/lib/regexp', 'ace/lib/es5-shim'], function(require, exports, module) {


require("./regexp");
require("./es5-shim");

});
 
define('ace/lib/regexp', ['require', 'exports', 'module' ], function(require, exports, module) {

    var real = {
            exec: RegExp.prototype.exec,
            test: RegExp.prototype.test,
            match: String.prototype.match,
            replace: String.prototype.replace,
            split: String.prototype.split
        },
        compliantExecNpcg = real.exec.call(/()??/, "")[1] === undefined, // check `exec` handling of nonparticipating capturing groups
        compliantLastIndexIncrement = function () {
            var x = /^/g;
            real.test.call(x, "");
            return !x.lastIndex;
        }();

    if (compliantLastIndexIncrement && compliantExecNpcg)
        return;
    RegExp.prototype.exec = function (str) {
        var match = real.exec.apply(this, arguments),
            name, r2;
        if ( typeof(str) == 'string' && match) {
            if (!compliantExecNpcg && match.length > 1 && indexOf(match, "") > -1) {
                r2 = RegExp(this.source, real.replace.call(getNativeFlags(this), "g", ""));
                real.replace.call(str.slice(match.index), r2, function () {
                    for (var i = 1; i < arguments.length - 2; i++) {
                        if (arguments[i] === undefined)
                            match[i] = undefined;
                    }
                });
            }
            if (this._xregexp && this._xregexp.captureNames) {
                for (var i = 1; i < match.length; i++) {
                    name = this._xregexp.captureNames[i - 1];
                    if (name)
                       match[name] = match[i];
                }
            }
            if (!compliantLastIndexIncrement && this.global && !match[0].length && (this.lastIndex > match.index))
                this.lastIndex--;
        }
        return match;
    };
    if (!compliantLastIndexIncrement) {
        RegExp.prototype.test = function (str) {
            var match = real.exec.call(this, str);
            if (match && this.global && !match[0].length && (this.lastIndex > match.index))
                this.lastIndex--;
            return !!match;
        };
    }

    function getNativeFlags (regex) {
        return (regex.global     ? "g" : "") +
               (regex.ignoreCase ? "i" : "") +
               (regex.multiline  ? "m" : "") +
               (regex.extended   ? "x" : "") + // Proposed for ES4; included in AS3
               (regex.sticky     ? "y" : "");
    }

    function indexOf (array, item, from) {
        if (Array.prototype.indexOf) // Use the native array method if available
            return array.indexOf(item, from);
        for (var i = from || 0; i < array.length; i++) {
            if (array[i] === item)
                return i;
        }
        return -1;
    }

});

define('ace/lib/es5-shim', ['require', 'exports', 'module' ], function(require, exports, module) {

if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) { // .length is 1
        var target = this;
        if (typeof target != "function")
            throw new TypeError(); // TODO message
        var args = slice.call(arguments, 1); // for normal call
        var bound = function () {

            if (this instanceof bound) {

                var F = function(){};
                F.prototype = target.prototype;
                var self = new F;

                var result = target.apply(
                    self,
                    args.concat(slice.call(arguments))
                );
                if (result !== null && Object(result) === result)
                    return result;
                return self;

            } else {
                return target.apply(
                    that,
                    args.concat(slice.call(arguments))
                );

            }

        };
        return bound;
    };
}
var call = Function.prototype.call;
var prototypeOfArray = Array.prototype;
var prototypeOfObject = Object.prototype;
var slice = prototypeOfArray.slice;
var toString = call.bind(prototypeOfObject.toString);
var owns = call.bind(prototypeOfObject.hasOwnProperty);
var defineGetter;
var defineSetter;
var lookupGetter;
var lookupSetter;
var supportsAccessors;
if ((supportsAccessors = owns(prototypeOfObject, "__defineGetter__"))) {
    defineGetter = call.bind(prototypeOfObject.__defineGetter__);
    defineSetter = call.bind(prototypeOfObject.__defineSetter__);
    lookupGetter = call.bind(prototypeOfObject.__lookupGetter__);
    lookupSetter = call.bind(prototypeOfObject.__lookupSetter__);
}
if (!Array.isArray) {
    Array.isArray = function isArray(obj) {
        return toString(obj) == "[object Array]";
    };
}
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function forEach(fun /*, thisp*/) {
        var self = toObject(this),
            thisp = arguments[1],
            i = 0,
            length = self.length >>> 0;
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        while (i < length) {
            if (i in self) {
                fun.call(thisp, self[i], i, self);
            }
            i++;
        }
    };
}
if (!Array.prototype.map) {
    Array.prototype.map = function map(fun /*, thisp*/) {
        var self = toObject(this),
            length = self.length >>> 0,
            result = Array(length),
            thisp = arguments[1];
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        for (var i = 0; i < length; i++) {
            if (i in self)
                result[i] = fun.call(thisp, self[i], i, self);
        }
        return result;
    };
}
if (!Array.prototype.filter) {
    Array.prototype.filter = function filter(fun /*, thisp */) {
        var self = toObject(this),
            length = self.length >>> 0,
            result = [],
            thisp = arguments[1];
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, self))
                result.push(self[i]);
        }
        return result;
    };
}
if (!Array.prototype.every) {
    Array.prototype.every = function every(fun /*, thisp */) {
        var self = toObject(this),
            length = self.length >>> 0,
            thisp = arguments[1];
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        for (var i = 0; i < length; i++) {
            if (i in self && !fun.call(thisp, self[i], i, self))
                return false;
        }
        return true;
    };
}
if (!Array.prototype.some) {
    Array.prototype.some = function some(fun /*, thisp */) {
        var self = toObject(this),
            length = self.length >>> 0,
            thisp = arguments[1];
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, self))
                return true;
        }
        return false;
    };
}
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function reduce(fun /*, initial*/) {
        var self = toObject(this),
            length = self.length >>> 0;
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }
        if (!length && arguments.length == 1)
            throw new TypeError(); // TODO message

        var i = 0;
        var result;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i++];
                    break;
                }
                if (++i >= length)
                    throw new TypeError(); // TODO message
            } while (true);
        }

        for (; i < length; i++) {
            if (i in self)
                result = fun.call(void 0, result, self[i], i, self);
        }

        return result;
    };
}
if (!Array.prototype.reduceRight) {
    Array.prototype.reduceRight = function reduceRight(fun /*, initial*/) {
        var self = toObject(this),
            length = self.length >>> 0;
        if (toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }
        if (!length && arguments.length == 1)
            throw new TypeError(); // TODO message

        var result, i = length - 1;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i--];
                    break;
                }
                if (--i < 0)
                    throw new TypeError(); // TODO message
            } while (true);
        }

        do {
            if (i in this)
                result = fun.call(void 0, result, self[i], i, self);
        } while (i--);

        return result;
    };
}
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function indexOf(sought /*, fromIndex */ ) {
        var self = toObject(this),
            length = self.length >>> 0;

        if (!length)
            return -1;

        var i = 0;
        if (arguments.length > 1)
            i = toInteger(arguments[1]);
        i = i >= 0 ? i : Math.max(0, length + i);
        for (; i < length; i++) {
            if (i in self && self[i] === sought) {
                return i;
            }
        }
        return -1;
    };
}
if (!Array.prototype.lastIndexOf) {
    Array.prototype.lastIndexOf = function lastIndexOf(sought /*, fromIndex */) {
        var self = toObject(this),
            length = self.length >>> 0;

        if (!length)
            return -1;
        var i = length - 1;
        if (arguments.length > 1)
            i = Math.min(i, toInteger(arguments[1]));
        i = i >= 0 ? i : length - Math.abs(i);
        for (; i >= 0; i--) {
            if (i in self && sought === self[i])
                return i;
        }
        return -1;
    };
}
if (!Object.getPrototypeOf) {
    Object.getPrototypeOf = function getPrototypeOf(object) {
        return object.__proto__ || (
            object.constructor ?
            object.constructor.prototype :
            prototypeOfObject
        );
    };
}
if (!Object.getOwnPropertyDescriptor) {
    var ERR_NON_OBJECT = "Object.getOwnPropertyDescriptor called on a " +
                         "non-object: ";
    Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor(object, property) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT + object);
        if (!owns(object, property))
            return;

        var descriptor, getter, setter;
        descriptor =  { enumerable: true, configurable: true };
        if (supportsAccessors) {
            var prototype = object.__proto__;
            object.__proto__ = prototypeOfObject;

            var getter = lookupGetter(object, property);
            var setter = lookupSetter(object, property);
            object.__proto__ = prototype;

            if (getter || setter) {
                if (getter) descriptor.get = getter;
                if (setter) descriptor.set = setter;
                return descriptor;
            }
        }
        descriptor.value = object[property];
        return descriptor;
    };
}
if (!Object.getOwnPropertyNames) {
    Object.getOwnPropertyNames = function getOwnPropertyNames(object) {
        return Object.keys(object);
    };
}
if (!Object.create) {
    var createEmpty;
    if (Object.prototype.__proto__ === null) {
        createEmpty = function () {
            return { "__proto__": null };
        };
    } else {
        createEmpty = function () {
            var empty = {};
            for (var i in empty)
                empty[i] = null;
            empty.constructor =
            empty.hasOwnProperty =
            empty.propertyIsEnumerable =
            empty.isPrototypeOf =
            empty.toLocaleString =
            empty.toString =
            empty.valueOf =
            empty.__proto__ = null;
            return empty;
        }
    }

    Object.create = function create(prototype, properties) {
        var object;
        if (prototype === null) {
            object = createEmpty();
        } else {
            if (typeof prototype != "object")
                throw new TypeError("typeof prototype["+(typeof prototype)+"] != 'object'");
            var Type = function () {};
            Type.prototype = prototype;
            object = new Type();
            object.__proto__ = prototype;
        }
        if (properties !== void 0)
            Object.defineProperties(object, properties);
        return object;
    };
}

function doesDefinePropertyWork(object) {
    try {
        Object.defineProperty(object, "sentinel", {});
        return "sentinel" in object;
    } catch (exception) {
    }
}
if (Object.defineProperty) {
    var definePropertyWorksOnObject = doesDefinePropertyWork({});
    var definePropertyWorksOnDom = typeof document == "undefined" ||
        doesDefinePropertyWork(document.createElement("div"));
    if (!definePropertyWorksOnObject || !definePropertyWorksOnDom) {
        var definePropertyFallback = Object.defineProperty;
    }
}

if (!Object.defineProperty || definePropertyFallback) {
    var ERR_NON_OBJECT_DESCRIPTOR = "Property description must be an object: ";
    var ERR_NON_OBJECT_TARGET = "Object.defineProperty called on non-object: "
    var ERR_ACCESSORS_NOT_SUPPORTED = "getters & setters can not be defined " +
                                      "on this javascript engine";

    Object.defineProperty = function defineProperty(object, property, descriptor) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT_TARGET + object);
        if ((typeof descriptor != "object" && typeof descriptor != "function") || descriptor === null)
            throw new TypeError(ERR_NON_OBJECT_DESCRIPTOR + descriptor);
        if (definePropertyFallback) {
            try {
                return definePropertyFallback.call(Object, object, property, descriptor);
            } catch (exception) {
            }
        }
        if (owns(descriptor, "value")) {

            if (supportsAccessors && (lookupGetter(object, property) ||
                                      lookupSetter(object, property)))
            {
                var prototype = object.__proto__;
                object.__proto__ = prototypeOfObject;
                delete object[property];
                object[property] = descriptor.value;
                object.__proto__ = prototype;
            } else {
                object[property] = descriptor.value;
            }
        } else {
            if (!supportsAccessors)
                throw new TypeError(ERR_ACCESSORS_NOT_SUPPORTED);
            if (owns(descriptor, "get"))
                defineGetter(object, property, descriptor.get);
            if (owns(descriptor, "set"))
                defineSetter(object, property, descriptor.set);
        }

        return object;
    };
}
if (!Object.defineProperties) {
    Object.defineProperties = function defineProperties(object, properties) {
        for (var property in properties) {
            if (owns(properties, property))
                Object.defineProperty(object, property, properties[property]);
        }
        return object;
    };
}
if (!Object.seal) {
    Object.seal = function seal(object) {
        return object;
    };
}
if (!Object.freeze) {
    Object.freeze = function freeze(object) {
        return object;
    };
}
try {
    Object.freeze(function () {});
} catch (exception) {
    Object.freeze = (function freeze(freezeObject) {
        return function freeze(object) {
            if (typeof object == "function") {
                return object;
            } else {
                return freezeObject(object);
            }
        };
    })(Object.freeze);
}
if (!Object.preventExtensions) {
    Object.preventExtensions = function preventExtensions(object) {
        return object;
    };
}
if (!Object.isSealed) {
    Object.isSealed = function isSealed(object) {
        return false;
    };
}
if (!Object.isFrozen) {
    Object.isFrozen = function isFrozen(object) {
        return false;
    };
}
if (!Object.isExtensible) {
    Object.isExtensible = function isExtensible(object) {
        if (Object(object) === object) {
            throw new TypeError(); // TODO message
        }
        var name = '';
        while (owns(object, name)) {
            name += '?';
        }
        object[name] = true;
        var returnValue = owns(object, name);
        delete object[name];
        return returnValue;
    };
}
if (!Object.keys) {
    var hasDontEnumBug = true,
        dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
        ],
        dontEnumsLength = dontEnums.length;

    for (var key in {"toString": null})
        hasDontEnumBug = false;

    Object.keys = function keys(object) {

        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError("Object.keys called on a non-object");

        var keys = [];
        for (var name in object) {
            if (owns(object, name)) {
                keys.push(name);
            }
        }

        if (hasDontEnumBug) {
            for (var i = 0, ii = dontEnumsLength; i < ii; i++) {
                var dontEnum = dontEnums[i];
                if (owns(object, dontEnum)) {
                    keys.push(dontEnum);
                }
            }
        }

        return keys;
    };

}
if (!Date.prototype.toISOString || (new Date(-62198755200000).toISOString().indexOf('-000001') === -1)) {
    Date.prototype.toISOString = function toISOString() {
        var result, length, value, year;
        if (!isFinite(this))
            throw new RangeError;
        result = [this.getUTCMonth() + 1, this.getUTCDate(),
            this.getUTCHours(), this.getUTCMinutes(), this.getUTCSeconds()];
        year = this.getUTCFullYear();
        year = (year < 0 ? '-' : (year > 9999 ? '+' : '')) + ('00000' + Math.abs(year)).slice(0 <= year && year <= 9999 ? -4 : -6);

        length = result.length;
        while (length--) {
            value = result[length];
            if (value < 10)
                result[length] = "0" + value;
        }
        return year + "-" + result.slice(0, 2).join("-") + "T" + result.slice(2).join(":") + "." +
            ("000" + this.getUTCMilliseconds()).slice(-3) + "Z";
    }
}
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}
if (!Date.prototype.toJSON) {
    Date.prototype.toJSON = function toJSON(key) {
        if (typeof this.toISOString != "function")
            throw new TypeError(); // TODO message
        return this.toISOString();
    };
}
if (Date.parse("+275760-09-13T00:00:00.000Z") !== 8.64e15) {
    Date = (function(NativeDate) {
        var Date = function Date(Y, M, D, h, m, s, ms) {
            var length = arguments.length;
            if (this instanceof NativeDate) {
                var date = length == 1 && String(Y) === Y ? // isString(Y)
                    new NativeDate(Date.parse(Y)) :
                    length >= 7 ? new NativeDate(Y, M, D, h, m, s, ms) :
                    length >= 6 ? new NativeDate(Y, M, D, h, m, s) :
                    length >= 5 ? new NativeDate(Y, M, D, h, m) :
                    length >= 4 ? new NativeDate(Y, M, D, h) :
                    length >= 3 ? new NativeDate(Y, M, D) :
                    length >= 2 ? new NativeDate(Y, M) :
                    length >= 1 ? new NativeDate(Y) :
                                  new NativeDate();
                date.constructor = Date;
                return date;
            }
            return NativeDate.apply(this, arguments);
        };
        var isoDateExpression = new RegExp("^" +
            "(\\d{4}|[\+\-]\\d{6})" + // four-digit year capture or sign + 6-digit extended year
            "(?:-(\\d{2})" + // optional month capture
            "(?:-(\\d{2})" + // optional day capture
            "(?:" + // capture hours:minutes:seconds.milliseconds
                "T(\\d{2})" + // hours capture
                ":(\\d{2})" + // minutes capture
                "(?:" + // optional :seconds.milliseconds
                    ":(\\d{2})" + // seconds capture
                    "(?:\\.(\\d{3}))?" + // milliseconds capture
                ")?" +
            "(?:" + // capture UTC offset component
                "Z|" + // UTC capture
                "(?:" + // offset specifier +/-hours:minutes
                    "([-+])" + // sign capture
                    "(\\d{2})" + // hours offset capture
                    ":(\\d{2})" + // minutes offset capture
                ")" +
            ")?)?)?)?" +
        "$");
        for (var key in NativeDate)
            Date[key] = NativeDate[key];
        Date.now = NativeDate.now;
        Date.UTC = NativeDate.UTC;
        Date.prototype = NativeDate.prototype;
        Date.prototype.constructor = Date;
        Date.parse = function parse(string) {
            var match = isoDateExpression.exec(string);
            if (match) {
                match.shift(); // kill match[0], the full match
                for (var i = 1; i < 7; i++) {
                    match[i] = +(match[i] || (i < 3 ? 1 : 0));
                    if (i == 1)
                        match[i]--;
                }
                var minuteOffset = +match.pop(), hourOffset = +match.pop(), sign = match.pop();
                var offset = 0;
                if (sign) {
                    if (hourOffset > 23 || minuteOffset > 59)
                        return NaN;
                    offset = (hourOffset * 60 + minuteOffset) * 6e4 * (sign == "+" ? -1 : 1);
                }
                var year = +match[0];
                if (0 <= year && year <= 99) {
                    match[0] = year + 400;
                    return NativeDate.UTC.apply(this, match) + offset - 12622780800000;
                }
                return NativeDate.UTC.apply(this, match) + offset;
            }
            return NativeDate.parse.apply(this, arguments);
        };

        return Date;
    })(Date);
}
var ws = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
    "\u2029\uFEFF";
if (!String.prototype.trim || ws.trim()) {
    ws = "[" + ws + "]";
    var trimBeginRegexp = new RegExp("^" + ws + ws + "*"),
        trimEndRegexp = new RegExp(ws + ws + "*$");
    String.prototype.trim = function trim() {
        return String(this).replace(trimBeginRegexp, "").replace(trimEndRegexp, "");
    };
}
var toInteger = function (n) {
    n = +n;
    if (n !== n) // isNaN
        n = 0;
    else if (n !== 0 && n !== (1/0) && n !== -(1/0))
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    return n;
};

var prepareString = "a"[0] != "a",
    toObject = function (o) {
        if (o == null) { // this matches both null and undefined
            throw new TypeError(); // TODO message
        }
        if (prepareString && typeof o == "string" && o) {
            return o.split("");
        }
        return Object(o);
    };
});

define('ace/lib/event_emitter', ['require', 'exports', 'module' ], function(require, exports, module) {


var EventEmitter = {};

EventEmitter._emit =
EventEmitter._dispatchEvent = function(eventName, e) {
    this._eventRegistry = this._eventRegistry || {};
    this._defaultHandlers = this._defaultHandlers || {};

    var listeners = this._eventRegistry[eventName] || [];
    var defaultHandler = this._defaultHandlers[eventName];
    if (!listeners.length && !defaultHandler)
        return;

    if (typeof e != "object" || !e)
        e = {};

    if (!e.type)
        e.type = eventName;
    
    if (!e.stopPropagation) {
        e.stopPropagation = function() {
            this.propagationStopped = true;
        };
    }
    
    if (!e.preventDefault) {
        e.preventDefault = function() {
            this.defaultPrevented = true;
        };
    }

    for (var i=0; i<listeners.length; i++) {
        listeners[i](e);
        if (e.propagationStopped)
            break;
    }
    
    if (defaultHandler && !e.defaultPrevented)
        return defaultHandler(e);
};

EventEmitter.setDefaultHandler = function(eventName, callback) {
    this._defaultHandlers = this._defaultHandlers || {};
    
    if (this._defaultHandlers[eventName])
        throw new Error("The default handler for '" + eventName + "' is already set");
        
    this._defaultHandlers[eventName] = callback;
};

EventEmitter.on =
EventEmitter.addEventListener = function(eventName, callback) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        listeners = this._eventRegistry[eventName] = [];

    if (listeners.indexOf(callback) == -1)
        listeners.push(callback);
};

EventEmitter.removeListener =
EventEmitter.removeEventListener = function(eventName, callback) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        return;

    var index = listeners.indexOf(callback);
    if (index !== -1)
        listeners.splice(index, 1);
};

EventEmitter.removeAllListeners = function(eventName) {
    if (this._eventRegistry) this._eventRegistry[eventName] = [];
};

exports.EventEmitter = EventEmitter;

});

define('ace/lib/oop', ['require', 'exports', 'module' ], function(require, exports, module) {


exports.inherits = (function() {
    var tempCtor = function() {};
    return function(ctor, superCtor) {
        tempCtor.prototype = superCtor.prototype;
        ctor.super_ = superCtor.prototype;
        ctor.prototype = new tempCtor();
        ctor.prototype.constructor = ctor;
    };
}());

exports.mixin = function(obj, mixin) {
    for (var key in mixin) {
        obj[key] = mixin[key];
    }
};

exports.implement = function(proto, mixin) {
    exports.mixin(proto, mixin);
};

});
 
define('ace/mode/xquery_worker', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/worker/mirror', 'ace/mode/xquery/JSONParseTreeHandler', 'ace/mode/xquery/XQueryParser', 'ace/mode/xquery/visitors/SyntaxHighlighter'], function(require, exports, module) {

    
var oop = require("../lib/oop");
var Mirror = require("../worker/mirror").Mirror;
var JSONParseTreeHandler  = require("./xquery/JSONParseTreeHandler").JSONParseTreeHandler;
var XQueryParser  = require("./xquery/XQueryParser").XQueryParser;
var SyntaxHighlighter = require("../mode/xquery/visitors/SyntaxHighlighter").SyntaxHighlighter;

var XQueryWorker = exports.XQueryWorker = function(sender) {
    Mirror.call(this, sender);
    this.setTimeout(200);
};

oop.inherits(XQueryWorker, Mirror);

(function() {
    
  this.onUpdate = function() {
    this.sender.emit("start");
    var value = this.doc.getValue();    
    var h = new JSONParseTreeHandler();
    var parser = new XQueryParser(value, h);
    try {
      parser.parse_XQuery();
      var ast = h.getParseTree();
      this.sender.emit("ok");
      var highlighter = new SyntaxHighlighter(value, ast);
      var tokens = highlighter.getTokens();
      this.sender.emit("highlight", tokens);
    } catch(e) {
      var prefix = value.substring(0, e.getBegin());
      var line = prefix.split("\n").length;
      var column = e.getBegin() - prefix.lastIndexOf("\n");
      var message = parser.getErrorMessage(e);
      this.sender.emit("error", {
        row: line - 1,
        column: column,
        text: message,
        type: "error"
      });
    }
  };
    
}).call(XQueryWorker.prototype);

});
define('ace/worker/mirror', ['require', 'exports', 'module' , 'ace/document', 'ace/lib/lang'], function(require, exports, module) {


var Document = require("../document").Document;
var lang = require("../lib/lang");
    
var Mirror = exports.Mirror = function(sender) {
    this.sender = sender;
    var doc = this.doc = new Document("");
    
    var deferredUpdate = this.deferredUpdate = lang.deferredCall(this.onUpdate.bind(this));
    
    var _self = this;
    sender.on("change", function(e) {
        doc.applyDeltas([e.data]);        
        deferredUpdate.schedule(_self.$timeout);
    });
};

(function() {
    
    this.$timeout = 500;
    
    this.setTimeout = function(timeout) {
        this.$timeout = timeout;
    };
    
    this.setValue = function(value) {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    };
    
    this.getValue = function(callbackId) {
        this.sender.callback(this.doc.getValue(), callbackId);
    };
    
    this.onUpdate = function() {
    };
    
}).call(Mirror.prototype);

});

define('ace/document', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/event_emitter', 'ace/range', 'ace/anchor'], function(require, exports, module) {


var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;
var Range = require("./range").Range;
var Anchor = require("./anchor").Anchor;

var Document = function(text) {
    this.$lines = [];
    if (text.length == 0) {
        this.$lines = [""];
    } else if (Array.isArray(text)) {
        this.insertLines(0, text);
    } else {
        this.insert({row: 0, column:0}, text);
    }
};

(function() {

    oop.implement(this, EventEmitter);
    this.setValue = function(text) {
        var len = this.getLength();
        this.remove(new Range(0, 0, len, this.getLine(len-1).length));
        this.insert({row: 0, column:0}, text);
    };
    this.getValue = function() {
        return this.getAllLines().join(this.getNewLineCharacter());
    };
    this.createAnchor = function(row, column) {
        return new Anchor(this, row, column);
    };
    if ("aaa".split(/a/).length == 0)
        this.$split = function(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        }
    else
        this.$split = function(text) {
            return text.split(/\r\n|\r|\n/);
        };
    this.$detectNewLine = function(text) {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        if (match) {
            this.$autoNewLine = match[1];
        } else {
            this.$autoNewLine = "\n";
        }
    };
    this.getNewLineCharacter = function() {
      switch (this.$newLineMode) {
          case "windows":
              return "\r\n";

          case "unix":
              return "\n";

          case "auto":
              return this.$autoNewLine;
      }
    };

    this.$autoNewLine = "\n";
    this.$newLineMode = "auto";
    this.setNewLineMode = function(newLineMode) {
        if (this.$newLineMode === newLineMode)
            return;

        this.$newLineMode = newLineMode;
    };
    this.getNewLineMode = function() {
        return this.$newLineMode;
    };
    this.isNewLine = function(text) {
        return (text == "\r\n" || text == "\r" || text == "\n");
    };
    this.getLine = function(row) {
        return this.$lines[row] || "";
    };
    this.getLines = function(firstRow, lastRow) {
        return this.$lines.slice(firstRow, lastRow + 1);
    };
    this.getAllLines = function() {
        return this.getLines(0, this.getLength());
    };
    this.getLength = function() {
        return this.$lines.length;
    };
    this.getTextRange = function(range) {
        if (range.start.row == range.end.row) {
            return this.$lines[range.start.row].substring(range.start.column,
                                                         range.end.column);
        }
        else {
            var lines = this.getLines(range.start.row+1, range.end.row-1);
            lines.unshift((this.$lines[range.start.row] || "").substring(range.start.column));
            lines.push((this.$lines[range.end.row] || "").substring(0, range.end.column));
            return lines.join(this.getNewLineCharacter());
        }
    };
    this.$clipPosition = function(position) {
        var length = this.getLength();
        if (position.row >= length) {
            position.row = Math.max(0, length - 1);
            position.column = this.getLine(length-1).length;
        }
        return position;
    };
    this.insert = function(position, text) {
        if (!text || text.length === 0)
            return position;

        position = this.$clipPosition(position);
        if (this.getLength() <= 1)
            this.$detectNewLine(text);

        var lines = this.$split(text);
        var firstLine = lines.splice(0, 1)[0];
        var lastLine = lines.length == 0 ? null : lines.splice(lines.length - 1, 1)[0];

        position = this.insertInLine(position, firstLine);
        if (lastLine !== null) {
            position = this.insertNewLine(position); // terminate first line
            position = this.insertLines(position.row, lines);
            position = this.insertInLine(position, lastLine || "");
        }
        return position;
    };
    this.insertLines = function(row, lines) {
        if (lines.length == 0)
            return {row: row, column: 0};
        if (lines.length > 0xFFFF) {
            var end = this.insertLines(row, lines.slice(0xFFFF));
            lines = lines.slice(0, 0xFFFF);
        }

        var args = [row, 0];
        args.push.apply(args, lines);
        this.$lines.splice.apply(this.$lines, args);

        var range = new Range(row, 0, row + lines.length, 0);
        var delta = {
            action: "insertLines",
            range: range,
            lines: lines
        };
        this._emit("change", { data: delta });
        return end || range.end;
    };
    this.insertNewLine = function(position) {
        position = this.$clipPosition(position);
        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column);
        this.$lines.splice(position.row + 1, 0, line.substring(position.column, line.length));

        var end = {
            row : position.row + 1,
            column : 0
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: this.getNewLineCharacter()
        };
        this._emit("change", { data: delta });

        return end;
    };
    this.insertInLine = function(position, text) {
        if (text.length == 0)
            return position;

        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column) + text
                + line.substring(position.column);

        var end = {
            row : position.row,
            column : position.column + text.length
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: text
        };
        this._emit("change", { data: delta });

        return end;
    };
    this.remove = function(range) {
        range.start = this.$clipPosition(range.start);
        range.end = this.$clipPosition(range.end);

        if (range.isEmpty())
            return range.start;

        var firstRow = range.start.row;
        var lastRow = range.end.row;

        if (range.isMultiLine()) {
            var firstFullRow = range.start.column == 0 ? firstRow : firstRow + 1;
            var lastFullRow = lastRow - 1;

            if (range.end.column > 0)
                this.removeInLine(lastRow, 0, range.end.column);

            if (lastFullRow >= firstFullRow)
                this.removeLines(firstFullRow, lastFullRow);

            if (firstFullRow != firstRow) {
                this.removeInLine(firstRow, range.start.column, this.getLine(firstRow).length);
                this.removeNewLine(range.start.row);
            }
        }
        else {
            this.removeInLine(firstRow, range.start.column, range.end.column);
        }
        return range.start;
    };
    this.removeInLine = function(row, startColumn, endColumn) {
        if (startColumn == endColumn)
            return;

        var range = new Range(row, startColumn, row, endColumn);
        var line = this.getLine(row);
        var removed = line.substring(startColumn, endColumn);
        var newLine = line.substring(0, startColumn) + line.substring(endColumn, line.length);
        this.$lines.splice(row, 1, newLine);

        var delta = {
            action: "removeText",
            range: range,
            text: removed
        };
        this._emit("change", { data: delta });
        return range.start;
    };
    this.removeLines = function(firstRow, lastRow) {
        var range = new Range(firstRow, 0, lastRow + 1, 0);
        var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);

        var delta = {
            action: "removeLines",
            range: range,
            nl: this.getNewLineCharacter(),
            lines: removed
        };
        this._emit("change", { data: delta });
        return removed;
    };
    this.removeNewLine = function(row) {
        var firstLine = this.getLine(row);
        var secondLine = this.getLine(row+1);

        var range = new Range(row, firstLine.length, row+1, 0);
        var line = firstLine + secondLine;

        this.$lines.splice(row, 2, line);

        var delta = {
            action: "removeText",
            range: range,
            text: this.getNewLineCharacter()
        };
        this._emit("change", { data: delta });
    };
    this.replace = function(range, text) {
        if (text.length == 0 && range.isEmpty())
            return range.start;
        if (text == this.getTextRange(range))
            return range.end;

        this.remove(range);
        if (text) {
            var end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }

        return end;
    };
    this.applyDeltas = function(deltas) {
        for (var i=0; i<deltas.length; i++) {
            var delta = deltas[i];
            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "insertText")
                this.insert(range.start, delta.text);
            else if (delta.action == "removeLines")
                this.removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "removeText")
                this.remove(range);
        }
    };
    this.revertDeltas = function(deltas) {
        for (var i=deltas.length-1; i>=0; i--) {
            var delta = deltas[i];

            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this.removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "insertText")
                this.remove(range);
            else if (delta.action == "removeLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "removeText")
                this.insert(range.start, delta.text);
        }
    };

}).call(Document.prototype);

exports.Document = Document;
});

define('ace/range', ['require', 'exports', 'module' ], function(require, exports, module) {
var Range = function(startRow, startColumn, endRow, endColumn) {
    this.start = {
        row: startRow,
        column: startColumn
    };

    this.end = {
        row: endRow,
        column: endColumn
    };
};

(function() { 
    this.isEqual = function(range) {
        return this.start.row == range.start.row &&
            this.end.row == range.end.row &&
            this.start.column == range.start.column &&
            this.end.column == range.end.column
    }; 
    this.toString = function() {
        return ("Range: [" + this.start.row + "/" + this.start.column +
            "] -> [" + this.end.row + "/" + this.end.column + "]");
    }; 

    this.contains = function(row, column) {
        return this.compare(row, column) == 0;
    }; 
    this.compareRange = function(range) {
        var cmp,
            end = range.end,
            start = range.start;

        cmp = this.compare(end.row, end.column);
        if (cmp == 1) {
            cmp = this.compare(start.row, start.column);
            if (cmp == 1) {
                return 2;
            } else if (cmp == 0) {
                return 1;
            } else {
                return 0;
            }
        } else if (cmp == -1) {
            return -2;
        } else {
            cmp = this.compare(start.row, start.column);
            if (cmp == -1) {
                return -1;
            } else if (cmp == 1) {
                return 42;
            } else {
                return 0;
            }
        }
    } 
    this.comparePoint = function(p) {
        return this.compare(p.row, p.column);
    } 
    this.containsRange = function(range) {
        return this.comparePoint(range.start) == 0 && this.comparePoint(range.end) == 0;
    }
    this.intersects = function(range) {
        var cmp = this.compareRange(range);
        return (cmp == -1 || cmp == 0 || cmp == 1);
    }
    this.isEnd = function(row, column) {
        return this.end.row == row && this.end.column == column;
    } 
    this.isStart = function(row, column) {
        return this.start.row == row && this.start.column == column;
    } 
    this.setStart = function(row, column) {
        if (typeof row == "object") {
            this.start.column = row.column;
            this.start.row = row.row;
        } else {
            this.start.row = row;
            this.start.column = column;
        }
    } 
    this.setEnd = function(row, column) {
        if (typeof row == "object") {
            this.end.column = row.column;
            this.end.row = row.row;
        } else {
            this.end.row = row;
            this.end.column = column;
        }
    } 
    this.inside = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column) || this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    } 
    this.insideStart = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    } 
    this.insideEnd = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    }
    this.compare = function(row, column) {
        if (!this.isMultiLine()) {
            if (row === this.start.row) {
                return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
            };
        }

        if (row < this.start.row)
            return -1;

        if (row > this.end.row)
            return 1;

        if (this.start.row === row)
            return column >= this.start.column ? 0 : -1;

        if (this.end.row === row)
            return column <= this.end.column ? 0 : 1;

        return 0;
    };
    this.compareStart = function(row, column) {
        if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    }
    this.compareEnd = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else {
            return this.compare(row, column);
        }
    }
    this.compareInside = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    }
    this.clipRows = function(firstRow, lastRow) {
        if (this.end.row > lastRow) {
            var end = {
                row: lastRow+1,
                column: 0
            };
        }

        if (this.start.row > lastRow) {
            var start = {
                row: lastRow+1,
                column: 0
            };
        }

        if (this.start.row < firstRow) {
            var start = {
                row: firstRow,
                column: 0
            };
        }

        if (this.end.row < firstRow) {
            var end = {
                row: firstRow,
                column: 0
            };
        }
        return Range.fromPoints(start || this.start, end || this.end);
    };
    this.extend = function(row, column) {
        var cmp = this.compare(row, column);

        if (cmp == 0)
            return this;
        else if (cmp == -1)
            var start = {row: row, column: column};
        else
            var end = {row: row, column: column};

        return Range.fromPoints(start || this.start, end || this.end);
    };

    this.isEmpty = function() {
        return (this.start.row == this.end.row && this.start.column == this.end.column);
    };
    this.isMultiLine = function() {
        return (this.start.row !== this.end.row);
    };
    this.clone = function() {
        return Range.fromPoints(this.start, this.end);
    };
    this.collapseRows = function() {
        if (this.end.column == 0)
            return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row-1), 0)
        else
            return new Range(this.start.row, 0, this.end.row, 0)
    };
    this.toScreenRange = function(session) {
        var screenPosStart =
            session.documentToScreenPosition(this.start);
        var screenPosEnd =
            session.documentToScreenPosition(this.end);

        return new Range(
            screenPosStart.row, screenPosStart.column,
            screenPosEnd.row, screenPosEnd.column
        );
    };

}).call(Range.prototype);
Range.fromPoints = function(start, end) {
    return new Range(start.row, start.column, end.row, end.column);
};

exports.Range = Range;
});

define('ace/anchor', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/event_emitter'], function(require, exports, module) {


var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;

var Anchor = exports.Anchor = function(doc, row, column) {
    this.document = doc;
    
    if (typeof column == "undefined")
        this.setPosition(row.row, row.column);
    else
        this.setPosition(row, column);

    this.$onChange = this.onChange.bind(this);
    doc.on("change", this.$onChange);
};

(function() {

    oop.implement(this, EventEmitter);

    this.getPosition = function() {
        return this.$clipPositionToDocument(this.row, this.column);
    };
        
    this.getDocument = function() {
        return this.document;
    };

    this.onChange = function(e) {
        var delta = e.data;
        var range = delta.range;
            
        if (range.start.row == range.end.row && range.start.row != this.row)
            return;
            
        if (range.start.row > this.row)
            return;
            
        if (range.start.row == this.row && range.start.column > this.column)
            return;
    
        var row = this.row;
        var column = this.column;
        
        if (delta.action === "insertText") {
            if (range.start.row === row && range.start.column <= column) {
                if (range.start.row === range.end.row) {
                    column += range.end.column - range.start.column;
                }
                else {
                    column -= range.start.column;
                    row += range.end.row - range.start.row;
                }
            }
            else if (range.start.row !== range.end.row && range.start.row < row) {
                row += range.end.row - range.start.row;
            }
        } else if (delta.action === "insertLines") {
            if (range.start.row <= row) {
                row += range.end.row - range.start.row;
            }
        }
        else if (delta.action == "removeText") {
            if (range.start.row == row && range.start.column < column) {
                if (range.end.column >= column)
                    column = range.start.column;
                else
                    column = Math.max(0, column - (range.end.column - range.start.column));
                
            } else if (range.start.row !== range.end.row && range.start.row < row) {
                if (range.end.row == row) {
                    column = Math.max(0, column - range.end.column) + range.start.column;
                }
                row -= (range.end.row - range.start.row);
            }
            else if (range.end.row == row) {
                row -= range.end.row - range.start.row;
                column = Math.max(0, column - range.end.column) + range.start.column;
            }
        } else if (delta.action == "removeLines") {
            if (range.start.row <= row) {
                if (range.end.row <= row)
                    row -= range.end.row - range.start.row;
                else {
                    row = range.start.row;
                    column = 0;
                }
            }
        }

        this.setPosition(row, column, true);
    };

    this.setPosition = function(row, column, noClip) {
        var pos;
        if (noClip) {
            pos = {
                row: row,
                column: column
            };
        }
        else {
            pos = this.$clipPositionToDocument(row, column);
        }
        
        if (this.row == pos.row && this.column == pos.column)
            return;
            
        var old = {
            row: this.row,
            column: this.column
        };
        
        this.row = pos.row;
        this.column = pos.column;
        this._emit("change", {
            old: old,
            value: pos
        });
    };

    this.detach = function() {
        this.document.removeEventListener("change", this.$onChange);
    };

    this.$clipPositionToDocument = function(row, column) {
        var pos = {};
    
        if (row >= this.document.getLength()) {
            pos.row = Math.max(0, this.document.getLength() - 1);
            pos.column = this.document.getLine(pos.row).length;
        }
        else if (row < 0) {
            pos.row = 0;
            pos.column = 0;
        }
        else {
            pos.row = row;
            pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
        }
        
        if (column < 0)
            pos.column = 0;
            
        return pos;
    };
    
}).call(Anchor.prototype);

});

define('ace/lib/lang', ['require', 'exports', 'module' ], function(require, exports, module) {


exports.stringReverse = function(string) {
    return string.split("").reverse().join("");
};

exports.stringRepeat = function (string, count) {
     return new Array(count + 1).join(string);
};

var trimBeginRegexp = /^\s\s*/;
var trimEndRegexp = /\s\s*$/;

exports.stringTrimLeft = function (string) {
    return string.replace(trimBeginRegexp, '');
};

exports.stringTrimRight = function (string) {
    return string.replace(trimEndRegexp, '');
};

exports.copyObject = function(obj) {
    var copy = {};
    for (var key in obj) {
        copy[key] = obj[key];
    }
    return copy;
};

exports.copyArray = function(array){
    var copy = [];
    for (var i=0, l=array.length; i<l; i++) {
        if (array[i] && typeof array[i] == "object")
            copy[i] = this.copyObject( array[i] );
        else 
            copy[i] = array[i];
    }
    return copy;
};

exports.deepCopy = function (obj) {
    if (typeof obj != "object") {
        return obj;
    }
    
    var copy = obj.constructor();
    for (var key in obj) {
        if (typeof obj[key] == "object") {
            copy[key] = this.deepCopy(obj[key]);
        } else {
            copy[key] = obj[key];
        }
    }
    return copy;
};

exports.arrayToMap = function(arr) {
    var map = {};
    for (var i=0; i<arr.length; i++) {
        map[arr[i]] = 1;
    }
    return map;

};

exports.createMap = function(props) {
    var map = Object.create(null);
    for (var i in props) {
        map[i] = props[i];
    }
    return map;
};
exports.arrayRemove = function(array, value) {
  for (var i = 0; i <= array.length; i++) {
    if (value === array[i]) {
      array.splice(i, 1);
    }
  }
};

exports.escapeRegExp = function(str) {
    return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
};

exports.escapeHTML = function(str) {
    return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
};

exports.getMatchOffsets = function(string, regExp) {
    var matches = [];

    string.replace(regExp, function(str) {
        matches.push({
            offset: arguments[arguments.length-2],
            length: str.length
        });
    });

    return matches;
};
exports.deferredCall = function(fcn) {

    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var deferred = function(timeout) {
        deferred.cancel();
        timer = setTimeout(callback, timeout || 0);
        return deferred;
    };

    deferred.schedule = deferred;

    deferred.call = function() {
        this.cancel();
        fcn();
        return deferred;
    };

    deferred.cancel = function() {
        clearTimeout(timer);
        timer = null;
        return deferred;
    };

    return deferred;
};


exports.delayedCall = function(fcn, defaultTimeout) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var _self = function(timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(callback, timeout || defaultTimeout);
    };

    _self.delay = delayed;
    _self.schedule = function(timeout) {
        if (timer == null)
            timer = setTimeout(callback, timeout || 0);
    };

    _self.call = function() {
        this.cancel();
        fcn();
    };

    _self.cancel = function() {
        timer && clearTimeout(timer);
        timer = null;
    };

    _self.isPending = function() {
        return timer;
    };

    return _self;
};
});
 
define('ace/mode/xquery/JSONParseTreeHandler', ['require', 'exports', 'module' ], function(require, exports, module) {
  var JSONParseTreeHandler = exports.JSONParseTreeHandler = function() {
    
    var ast = null;
    var ptr = null;
    
    function createNode(name){
      return { name: name, children: [], getParent: null };
    }
  
    function pushNode(name, begin){
      var node = createNode(name);
      node.begin = begin;
      if(ast === null) {
        ast = node;
        ptr = node;
      } else {
        node.getParent = ptr;
        ptr.children.push(node);
        ptr = ptr.children[ptr.children.length - 1];
      }
    }
    
    function popNode(name, end){
      ptr.end = end;
      if(ptr.getParent !== null) {
        ptr = ptr.getParent;
        for(var i in ptr.children) {
          delete ptr.children[i].getParent;
        }
      } else {
        delete ptr.getParent;
      }
    }
 
    this.getParseTree = function() {
      return ast;
    };
 
    this.reset = function(input) {};

    this.startNonterminal = function(name, begin) {
      pushNode(name, begin);
    };

    this.endNonterminal = function(name, end) {
      popNode(name, end);
    };

    this.terminal = function(name, begin, end) {
      var name = (name.substring(0, 1) === "'" && name.substring(name.length - 1) === "'") ? "TOKEN" : name;
      pushNode(name, begin);
      popNode(name, end);
    };

    this.whitespace = function(begin, end) {
      var name = "WS";
      pushNode(name, begin);
      popNode(name, end);
    }; 
  };
});
 
define('ace/mode/xquery/XQueryParser', ['require', 'exports', 'module' ], function(require, exports, module) {

var XQueryParser = exports.XQueryParser = function XQueryParser(string, parsingEventHandler)
{
  init(string, parsingEventHandler);

  function ParseException(b, e, s, o, x)
  {
    var
      begin = b,
      end = e,
      state = s,
      offending = o,
      expected = x;

    this.getBegin = function() {return begin;};
    this.getEnd = function() {return end;};
    this.getState = function() {return state;};
    this.getExpected = function() {return expected;};
    this.getOffending = function() {return offending;};

    this.getMessage = function()
    {
      return offending < 0 ? "lexical analysis failed" : "syntax error";
    };
  }

  function init(string, parsingEventHandler)
  {
    eventHandler = parsingEventHandler;
    input = string;
    size = string.length;
    reset(0, 0, 0);
  }

  this.getInput = function()
  {
    return input;
  };

  function reset(l, b, e)
  {
                 b0 = b; e0 = b;
    l1 = l; b1 = b; e1 = e;
    l2 = 0;
    end = e;
    ex = -1;
    memo = new Object;
    eventHandler.reset(input);
  }

  this.getOffendingToken = function(e)
  {
    var o = e.getOffending();
    return o >= 0 ? XQueryParser.TOKEN[o] : null;
  };

  this.getExpectedTokenSet = function(e)
  {
    var expected;
    if (e.getExpected() < 0)
    {
      expected = getExpectedTokenSet(e.getState());
    }
    else
    {
      expected = [XQueryParser.TOKEN[e.getExpected()]];
    }
    return expected;
  };

  this.getErrorMessage = function(e)
  {
    var tokenSet = this.getExpectedTokenSet(e);
    var found = this.getOffendingToken(e);
    var prefix = input.substring(0, e.getBegin());
    var lines = prefix.split("\n");
    var line = lines.length;
    var column = e.getBegin() - lines[line - 1].length + 1;
    var size = e.getEnd() - e.getBegin();
    return e.getMessage()
         + (found == null ? "" : ", found " + found)
         + "\nwhile expecting "
         + (tokenSet.length == 1 ? tokenSet[0] : ("[" + tokenSet.join(", ") + "]"))
         + "\n"
         + (size == 0 ? "" : "after successfully scanning " + size + " characters beginning ")
         + "at line " + line + ", column " + column + ":\n..."
         + input.substring(e.getBegin(), Math.min(input.length, e.getBegin() + 64))
         + "...";
  };

  this.parse_XQuery = function()
  {
    eventHandler.startNonterminal("XQuery", e0);
    lookahead1W(267);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Module();
    shift(25);                      // EOF
    eventHandler.endNonterminal("XQuery", e0);
  };

  function parse_Module()
  {
    eventHandler.startNonterminal("Module", e0);
    switch (l1)
    {
    case 274:                       // 'xquery'
      lookahead2W(199);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    default:
      lk = l1;
    }
    if (lk == 64274                 // 'xquery' 'encoding'
     || lk == 134930)               // 'xquery' 'version'
    {
      parse_VersionDecl();
    }
    lookahead1W(267);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    switch (l1)
    {
    case 182:                       // 'module'
      lookahead2W(194);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 94390:                     // 'module' 'namespace'
      whitespace();
      parse_LibraryModule();
      break;
    default:
      whitespace();
      parse_MainModule();
    }
    eventHandler.endNonterminal("Module", e0);
  }

  function parse_VersionDecl()
  {
    eventHandler.startNonterminal("VersionDecl", e0);
    shift(274);                     // 'xquery'
    lookahead1W(116);               // S^WS | '(:' | 'encoding' | 'version'
    switch (l1)
    {
    case 125:                       // 'encoding'
      shift(125);                   // 'encoding'
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shift(11);                    // StringLiteral
      break;
    default:
      shift(263);                   // 'version'
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shift(11);                    // StringLiteral
      lookahead1W(109);             // S^WS | '(:' | ';' | 'encoding'
      if (l1 == 125)                // 'encoding'
      {
        shift(125);                 // 'encoding'
        lookahead1W(17);            // StringLiteral | S^WS | '(:'
        shift(11);                  // StringLiteral
      }
    }
    lookahead1W(28);                // S^WS | '(:' | ';'
    whitespace();
    parse_Separator();
    eventHandler.endNonterminal("VersionDecl", e0);
  }

  function parse_LibraryModule()
  {
    eventHandler.startNonterminal("LibraryModule", e0);
    parse_ModuleDecl();
    lookahead1W(138);               // S^WS | EOF | '(:' | 'declare' | 'import'
    whitespace();
    parse_Prolog();
    eventHandler.endNonterminal("LibraryModule", e0);
  }

  function parse_ModuleDecl()
  {
    eventHandler.startNonterminal("ModuleDecl", e0);
    shift(182);                     // 'module'
    lookahead1W(61);                // S^WS | '(:' | 'namespace'
    shift(184);                     // 'namespace'
    lookahead1W(250);               // NCName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_NCName();
    lookahead1W(29);                // S^WS | '(:' | '='
    shift(60);                      // '='
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    lookahead1W(28);                // S^WS | '(:' | ';'
    whitespace();
    parse_Separator();
    eventHandler.endNonterminal("ModuleDecl", e0);
  }

  function parse_Prolog()
  {
    eventHandler.startNonterminal("Prolog", e0);
    for (;;)
    {
      lookahead1W(267);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      switch (l1)
      {
      case 108:                     // 'declare'
        lookahead2W(213);           // S^WS | EOF | '!' | '!=' | '#' | '%' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 153:                     // 'import'
        lookahead2W(201);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      default:
        lk = l1;
      }
      if (lk != 42604               // 'declare' 'base-uri'
       && lk != 43628               // 'declare' 'boundary-space'
       && lk != 50284               // 'declare' 'construction'
       && lk != 53356               // 'declare' 'copy-namespaces'
       && lk != 54380               // 'declare' 'decimal-format'
       && lk != 55916               // 'declare' 'default'
       && lk != 72300               // 'declare' 'ft-option'
       && lk != 93337               // 'import' 'module'
       && lk != 94316               // 'declare' 'namespace'
       && lk != 104044              // 'declare' 'ordering'
       && lk != 113772              // 'declare' 'revalidation'
       && lk != 115353)             // 'import' 'schema'
      {
        break;
      }
      switch (l1)
      {
      case 108:                     // 'declare'
        lookahead2W(179);           // S^WS | '(:' | 'base-uri' | 'boundary-space' | 'construction' |
        break;
      default:
        lk = l1;
      }
      if (lk == 55916)              // 'declare' 'default'
      {
        lk = memoized(0, e0);
        if (lk == 0)
        {
          var b0A = b0; var e0A = e0; var l1A = l1;
          var b1A = b1; var e1A = e1; var l2A = l2;
          var b2A = b2; var e2A = e2;
          try
          {
            try_DefaultNamespaceDecl();
            lk = -1;
          }
          catch (p1A)
          {
            lk = -2;
          }
          b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
          b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
          b2 = b2A; e2 = e2A; end = e2A; }}
          memoize(0, e0, lk);
        }
      }
      switch (lk)
      {
      case -1:
        whitespace();
        parse_DefaultNamespaceDecl();
        break;
      case 94316:                   // 'declare' 'namespace'
        whitespace();
        parse_NamespaceDecl();
        break;
      case 153:                     // 'import'
        whitespace();
        parse_Import();
        break;
      case 72300:                   // 'declare' 'ft-option'
        whitespace();
        parse_FTOptionDecl();
        break;
      default:
        whitespace();
        parse_Setter();
      }
      lookahead1W(28);              // S^WS | '(:' | ';'
      whitespace();
      parse_Separator();
    }
    for (;;)
    {
      lookahead1W(267);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      switch (l1)
      {
      case 108:                     // 'declare'
        lookahead2W(210);           // S^WS | EOF | '!' | '!=' | '#' | '%' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      default:
        lk = l1;
      }
      if (lk != 16492               // 'declare' '%'
       && lk != 48748               // 'declare' 'collection'
       && lk != 51820               // 'declare' 'context'
       && lk != 74348               // 'declare' 'function'
       && lk != 79468               // 'declare' 'index'
       && lk != 82540               // 'declare' 'integrity'
       && lk != 101996              // 'declare' 'option'
       && lk != 131692              // 'declare' 'updating'
       && lk != 134252)             // 'declare' 'variable'
      {
        break;
      }
      switch (l1)
      {
      case 108:                     // 'declare'
        lookahead2W(175);           // S^WS | '%' | '(:' | 'collection' | 'context' | 'function' | 'index' |
        break;
      default:
        lk = l1;
      }
      switch (lk)
      {
      case 51820:                   // 'declare' 'context'
        whitespace();
        parse_ContextItemDecl();
        break;
      case 101996:                  // 'declare' 'option'
        whitespace();
        parse_OptionDecl();
        break;
      default:
        whitespace();
        parse_AnnotatedDecl();
      }
      lookahead1W(28);              // S^WS | '(:' | ';'
      whitespace();
      parse_Separator();
    }
    eventHandler.endNonterminal("Prolog", e0);
  }

  function parse_Separator()
  {
    eventHandler.startNonterminal("Separator", e0);
    shift(53);                      // ';'
    eventHandler.endNonterminal("Separator", e0);
  }

  function parse_Setter()
  {
    eventHandler.startNonterminal("Setter", e0);
    switch (l1)
    {
    case 108:                       // 'declare'
      lookahead2W(172);             // S^WS | '(:' | 'base-uri' | 'boundary-space' | 'construction' |
      break;
    default:
      lk = l1;
    }
    if (lk == 55916)                // 'declare' 'default'
    {
      lk = memoized(1, e0);
      if (lk == 0)
      {
        var b0A = b0; var e0A = e0; var l1A = l1;
        var b1A = b1; var e1A = e1; var l2A = l2;
        var b2A = b2; var e2A = e2;
        try
        {
          try_DefaultCollationDecl();
          lk = -2;
        }
        catch (p2A)
        {
          try
          {
            b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
            b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
            b2 = b2A; e2 = e2A; end = e2A; }}
            try_EmptyOrderDecl();
            lk = -6;
          }
          catch (p6A)
          {
            lk = -9;
          }
        }
        b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
        b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
        b2 = b2A; e2 = e2A; end = e2A; }}
        memoize(1, e0, lk);
      }
    }
    switch (lk)
    {
    case 43628:                     // 'declare' 'boundary-space'
      parse_BoundarySpaceDecl();
      break;
    case -2:
      parse_DefaultCollationDecl();
      break;
    case 42604:                     // 'declare' 'base-uri'
      parse_BaseURIDecl();
      break;
    case 50284:                     // 'declare' 'construction'
      parse_ConstructionDecl();
      break;
    case 104044:                    // 'declare' 'ordering'
      parse_OrderingModeDecl();
      break;
    case -6:
      parse_EmptyOrderDecl();
      break;
    case 113772:                    // 'declare' 'revalidation'
      parse_RevalidationDecl();
      break;
    case 53356:                     // 'declare' 'copy-namespaces'
      parse_CopyNamespacesDecl();
      break;
    default:
      parse_DecimalFormatDecl();
    }
    eventHandler.endNonterminal("Setter", e0);
  }

  function parse_BoundarySpaceDecl()
  {
    eventHandler.startNonterminal("BoundarySpaceDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(33);                // S^WS | '(:' | 'boundary-space'
    shift(85);                      // 'boundary-space'
    lookahead1W(133);               // S^WS | '(:' | 'preserve' | 'strip'
    switch (l1)
    {
    case 214:                       // 'preserve'
      shift(214);                   // 'preserve'
      break;
    default:
      shift(241);                   // 'strip'
    }
    eventHandler.endNonterminal("BoundarySpaceDecl", e0);
  }

  function parse_DefaultCollationDecl()
  {
    eventHandler.startNonterminal("DefaultCollationDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(46);                // S^WS | '(:' | 'default'
    shift(109);                     // 'default'
    lookahead1W(38);                // S^WS | '(:' | 'collation'
    shift(94);                      // 'collation'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    eventHandler.endNonterminal("DefaultCollationDecl", e0);
  }

  function try_DefaultCollationDecl()
  {
    shiftT(108);                    // 'declare'
    lookahead1W(46);                // S^WS | '(:' | 'default'
    shiftT(109);                    // 'default'
    lookahead1W(38);                // S^WS | '(:' | 'collation'
    shiftT(94);                     // 'collation'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shiftT(7);                      // URILiteral
  }

  function parse_BaseURIDecl()
  {
    eventHandler.startNonterminal("BaseURIDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(32);                // S^WS | '(:' | 'base-uri'
    shift(83);                      // 'base-uri'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    eventHandler.endNonterminal("BaseURIDecl", e0);
  }

  function parse_ConstructionDecl()
  {
    eventHandler.startNonterminal("ConstructionDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(41);                // S^WS | '(:' | 'construction'
    shift(98);                      // 'construction'
    lookahead1W(133);               // S^WS | '(:' | 'preserve' | 'strip'
    switch (l1)
    {
    case 241:                       // 'strip'
      shift(241);                   // 'strip'
      break;
    default:
      shift(214);                   // 'preserve'
    }
    eventHandler.endNonterminal("ConstructionDecl", e0);
  }

  function parse_OrderingModeDecl()
  {
    eventHandler.startNonterminal("OrderingModeDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(68);                // S^WS | '(:' | 'ordering'
    shift(203);                     // 'ordering'
    lookahead1W(131);               // S^WS | '(:' | 'ordered' | 'unordered'
    switch (l1)
    {
    case 202:                       // 'ordered'
      shift(202);                   // 'ordered'
      break;
    default:
      shift(256);                   // 'unordered'
    }
    eventHandler.endNonterminal("OrderingModeDecl", e0);
  }

  function parse_EmptyOrderDecl()
  {
    eventHandler.startNonterminal("EmptyOrderDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(46);                // S^WS | '(:' | 'default'
    shift(109);                     // 'default'
    lookahead1W(67);                // S^WS | '(:' | 'order'
    shift(201);                     // 'order'
    lookahead1W(49);                // S^WS | '(:' | 'empty'
    shift(123);                     // 'empty'
    lookahead1W(121);               // S^WS | '(:' | 'greatest' | 'least'
    switch (l1)
    {
    case 147:                       // 'greatest'
      shift(147);                   // 'greatest'
      break;
    default:
      shift(173);                   // 'least'
    }
    eventHandler.endNonterminal("EmptyOrderDecl", e0);
  }

  function try_EmptyOrderDecl()
  {
    shiftT(108);                    // 'declare'
    lookahead1W(46);                // S^WS | '(:' | 'default'
    shiftT(109);                    // 'default'
    lookahead1W(67);                // S^WS | '(:' | 'order'
    shiftT(201);                    // 'order'
    lookahead1W(49);                // S^WS | '(:' | 'empty'
    shiftT(123);                    // 'empty'
    lookahead1W(121);               // S^WS | '(:' | 'greatest' | 'least'
    switch (l1)
    {
    case 147:                       // 'greatest'
      shiftT(147);                  // 'greatest'
      break;
    default:
      shiftT(173);                  // 'least'
    }
  }

  function parse_CopyNamespacesDecl()
  {
    eventHandler.startNonterminal("CopyNamespacesDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(44);                // S^WS | '(:' | 'copy-namespaces'
    shift(104);                     // 'copy-namespaces'
    lookahead1W(128);               // S^WS | '(:' | 'no-preserve' | 'preserve'
    whitespace();
    parse_PreserveMode();
    lookahead1W(25);                // S^WS | '(:' | ','
    shift(41);                      // ','
    lookahead1W(123);               // S^WS | '(:' | 'inherit' | 'no-inherit'
    whitespace();
    parse_InheritMode();
    eventHandler.endNonterminal("CopyNamespacesDecl", e0);
  }

  function parse_PreserveMode()
  {
    eventHandler.startNonterminal("PreserveMode", e0);
    switch (l1)
    {
    case 214:                       // 'preserve'
      shift(214);                   // 'preserve'
      break;
    default:
      shift(190);                   // 'no-preserve'
    }
    eventHandler.endNonterminal("PreserveMode", e0);
  }

  function parse_InheritMode()
  {
    eventHandler.startNonterminal("InheritMode", e0);
    switch (l1)
    {
    case 157:                       // 'inherit'
      shift(157);                   // 'inherit'
      break;
    default:
      shift(189);                   // 'no-inherit'
    }
    eventHandler.endNonterminal("InheritMode", e0);
  }

  function parse_DecimalFormatDecl()
  {
    eventHandler.startNonterminal("DecimalFormatDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(114);               // S^WS | '(:' | 'decimal-format' | 'default'
    switch (l1)
    {
    case 106:                       // 'decimal-format'
      shift(106);                   // 'decimal-format'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_EQName();
      break;
    default:
      shift(109);                   // 'default'
      lookahead1W(45);              // S^WS | '(:' | 'decimal-format'
      shift(106);                   // 'decimal-format'
    }
    for (;;)
    {
      lookahead1W(181);             // S^WS | '(:' | ';' | 'NaN' | 'decimal-separator' | 'digit' |
      if (l1 == 53)                 // ';'
      {
        break;
      }
      whitespace();
      parse_DFPropertyName();
      lookahead1W(29);              // S^WS | '(:' | '='
      shift(60);                    // '='
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shift(11);                    // StringLiteral
    }
    eventHandler.endNonterminal("DecimalFormatDecl", e0);
  }

  function parse_DFPropertyName()
  {
    eventHandler.startNonterminal("DFPropertyName", e0);
    switch (l1)
    {
    case 107:                       // 'decimal-separator'
      shift(107);                   // 'decimal-separator'
      break;
    case 149:                       // 'grouping-separator'
      shift(149);                   // 'grouping-separator'
      break;
    case 156:                       // 'infinity'
      shift(156);                   // 'infinity'
      break;
    case 179:                       // 'minus-sign'
      shift(179);                   // 'minus-sign'
      break;
    case 67:                        // 'NaN'
      shift(67);                    // 'NaN'
      break;
    case 209:                       // 'percent'
      shift(209);                   // 'percent'
      break;
    case 208:                       // 'per-mille'
      shift(208);                   // 'per-mille'
      break;
    case 275:                       // 'zero-digit'
      shift(275);                   // 'zero-digit'
      break;
    case 116:                       // 'digit'
      shift(116);                   // 'digit'
      break;
    default:
      shift(207);                   // 'pattern-separator'
    }
    eventHandler.endNonterminal("DFPropertyName", e0);
  }

  function parse_Import()
  {
    eventHandler.startNonterminal("Import", e0);
    switch (l1)
    {
    case 153:                       // 'import'
      lookahead2W(126);             // S^WS | '(:' | 'module' | 'schema'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 115353:                    // 'import' 'schema'
      parse_SchemaImport();
      break;
    default:
      parse_ModuleImport();
    }
    eventHandler.endNonterminal("Import", e0);
  }

  function parse_SchemaImport()
  {
    eventHandler.startNonterminal("SchemaImport", e0);
    shift(153);                     // 'import'
    lookahead1W(73);                // S^WS | '(:' | 'schema'
    shift(225);                     // 'schema'
    lookahead1W(137);               // URILiteral | S^WS | '(:' | 'default' | 'namespace'
    if (l1 != 7)                    // URILiteral
    {
      whitespace();
      parse_SchemaPrefix();
    }
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    lookahead1W(108);               // S^WS | '(:' | ';' | 'at'
    if (l1 == 81)                   // 'at'
    {
      shift(81);                    // 'at'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shift(7);                     // URILiteral
      for (;;)
      {
        lookahead1W(103);           // S^WS | '(:' | ',' | ';'
        if (l1 != 41)               // ','
        {
          break;
        }
        shift(41);                  // ','
        lookahead1W(15);            // URILiteral | S^WS | '(:'
        shift(7);                   // URILiteral
      }
    }
    eventHandler.endNonterminal("SchemaImport", e0);
  }

  function parse_SchemaPrefix()
  {
    eventHandler.startNonterminal("SchemaPrefix", e0);
    switch (l1)
    {
    case 184:                       // 'namespace'
      shift(184);                   // 'namespace'
      lookahead1W(250);             // NCName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_NCName();
      lookahead1W(29);              // S^WS | '(:' | '='
      shift(60);                    // '='
      break;
    default:
      shift(109);                   // 'default'
      lookahead1W(47);              // S^WS | '(:' | 'element'
      shift(121);                   // 'element'
      lookahead1W(61);              // S^WS | '(:' | 'namespace'
      shift(184);                   // 'namespace'
    }
    eventHandler.endNonterminal("SchemaPrefix", e0);
  }

  function parse_ModuleImport()
  {
    eventHandler.startNonterminal("ModuleImport", e0);
    shift(153);                     // 'import'
    lookahead1W(60);                // S^WS | '(:' | 'module'
    shift(182);                     // 'module'
    lookahead1W(90);                // URILiteral | S^WS | '(:' | 'namespace'
    if (l1 == 184)                  // 'namespace'
    {
      shift(184);                   // 'namespace'
      lookahead1W(250);             // NCName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_NCName();
      lookahead1W(29);              // S^WS | '(:' | '='
      shift(60);                    // '='
    }
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    lookahead1W(108);               // S^WS | '(:' | ';' | 'at'
    if (l1 == 81)                   // 'at'
    {
      shift(81);                    // 'at'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shift(7);                     // URILiteral
      for (;;)
      {
        lookahead1W(103);           // S^WS | '(:' | ',' | ';'
        if (l1 != 41)               // ','
        {
          break;
        }
        shift(41);                  // ','
        lookahead1W(15);            // URILiteral | S^WS | '(:'
        shift(7);                   // URILiteral
      }
    }
    eventHandler.endNonterminal("ModuleImport", e0);
  }

  function parse_NamespaceDecl()
  {
    eventHandler.startNonterminal("NamespaceDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(61);                // S^WS | '(:' | 'namespace'
    shift(184);                     // 'namespace'
    lookahead1W(250);               // NCName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_NCName();
    lookahead1W(29);                // S^WS | '(:' | '='
    shift(60);                      // '='
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    eventHandler.endNonterminal("NamespaceDecl", e0);
  }

  function parse_DefaultNamespaceDecl()
  {
    eventHandler.startNonterminal("DefaultNamespaceDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(46);                // S^WS | '(:' | 'default'
    shift(109);                     // 'default'
    lookahead1W(115);               // S^WS | '(:' | 'element' | 'function'
    switch (l1)
    {
    case 121:                       // 'element'
      shift(121);                   // 'element'
      break;
    default:
      shift(145);                   // 'function'
    }
    lookahead1W(61);                // S^WS | '(:' | 'namespace'
    shift(184);                     // 'namespace'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    eventHandler.endNonterminal("DefaultNamespaceDecl", e0);
  }

  function try_DefaultNamespaceDecl()
  {
    shiftT(108);                    // 'declare'
    lookahead1W(46);                // S^WS | '(:' | 'default'
    shiftT(109);                    // 'default'
    lookahead1W(115);               // S^WS | '(:' | 'element' | 'function'
    switch (l1)
    {
    case 121:                       // 'element'
      shiftT(121);                  // 'element'
      break;
    default:
      shiftT(145);                  // 'function'
    }
    lookahead1W(61);                // S^WS | '(:' | 'namespace'
    shiftT(184);                    // 'namespace'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shiftT(7);                      // URILiteral
  }

  function parse_FTOptionDecl()
  {
    eventHandler.startNonterminal("FTOptionDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(52);                // S^WS | '(:' | 'ft-option'
    shift(141);                     // 'ft-option'
    lookahead1W(81);                // S^WS | '(:' | 'using'
    whitespace();
    parse_FTMatchOptions();
    eventHandler.endNonterminal("FTOptionDecl", e0);
  }

  function parse_AnnotatedDecl()
  {
    eventHandler.startNonterminal("AnnotatedDecl", e0);
    shift(108);                     // 'declare'
    for (;;)
    {
      lookahead1W(170);             // S^WS | '%' | '(:' | 'collection' | 'function' | 'index' | 'integrity' |
      if (l1 != 32                  // '%'
       && l1 != 257)                // 'updating'
      {
        break;
      }
      switch (l1)
      {
      case 257:                     // 'updating'
        whitespace();
        parse_CompatibilityAnnotation();
        break;
      default:
        whitespace();
        parse_Annotation();
      }
    }
    switch (l1)
    {
    case 262:                       // 'variable'
      whitespace();
      parse_VarDecl();
      break;
    case 145:                       // 'function'
      whitespace();
      parse_FunctionDecl();
      break;
    case 95:                        // 'collection'
      whitespace();
      parse_CollectionDecl();
      break;
    case 155:                       // 'index'
      whitespace();
      parse_IndexDecl();
      break;
    default:
      whitespace();
      parse_ICDecl();
    }
    eventHandler.endNonterminal("AnnotatedDecl", e0);
  }

  function parse_CompatibilityAnnotation()
  {
    eventHandler.startNonterminal("CompatibilityAnnotation", e0);
    shift(257);                     // 'updating'
    eventHandler.endNonterminal("CompatibilityAnnotation", e0);
  }

  function parse_Annotation()
  {
    eventHandler.startNonterminal("Annotation", e0);
    shift(32);                      // '%'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(171);               // S^WS | '%' | '(' | '(:' | 'collection' | 'function' | 'index' | 'integrity' |
    if (l1 == 34)                   // '('
    {
      shift(34);                    // '('
      lookahead1W(154);             // IntegerLiteral | DecimalLiteral | DoubleLiteral | StringLiteral | S^WS | '(:'
      whitespace();
      parse_Literal();
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shift(41);                  // ','
        lookahead1W(154);           // IntegerLiteral | DecimalLiteral | DoubleLiteral | StringLiteral | S^WS | '(:'
        whitespace();
        parse_Literal();
      }
      shift(37);                    // ')'
    }
    eventHandler.endNonterminal("Annotation", e0);
  }

  function try_Annotation()
  {
    shiftT(32);                     // '%'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_EQName();
    lookahead1W(171);               // S^WS | '%' | '(' | '(:' | 'collection' | 'function' | 'index' | 'integrity' |
    if (l1 == 34)                   // '('
    {
      shiftT(34);                   // '('
      lookahead1W(154);             // IntegerLiteral | DecimalLiteral | DoubleLiteral | StringLiteral | S^WS | '(:'
      try_Literal();
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shiftT(41);                 // ','
        lookahead1W(154);           // IntegerLiteral | DecimalLiteral | DoubleLiteral | StringLiteral | S^WS | '(:'
        try_Literal();
      }
      shiftT(37);                   // ')'
    }
  }

  function parse_VarDecl()
  {
    eventHandler.startNonterminal("VarDecl", e0);
    shift(262);                     // 'variable'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(147);               // S^WS | '(:' | ':=' | 'as' | 'external'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_TypeDeclaration();
    }
    lookahead1W(106);               // S^WS | '(:' | ':=' | 'external'
    switch (l1)
    {
    case 52:                        // ':='
      shift(52);                    // ':='
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_VarValue();
      break;
    default:
      shift(133);                   // 'external'
      lookahead1W(104);             // S^WS | '(:' | ':=' | ';'
      if (l1 == 52)                 // ':='
      {
        shift(52);                  // ':='
        lookahead1W(266);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        whitespace();
        parse_VarDefaultValue();
      }
    }
    eventHandler.endNonterminal("VarDecl", e0);
  }

  function parse_VarValue()
  {
    eventHandler.startNonterminal("VarValue", e0);
    parse_ExprSingle();
    eventHandler.endNonterminal("VarValue", e0);
  }

  function parse_VarDefaultValue()
  {
    eventHandler.startNonterminal("VarDefaultValue", e0);
    parse_ExprSingle();
    eventHandler.endNonterminal("VarDefaultValue", e0);
  }

  function parse_ContextItemDecl()
  {
    eventHandler.startNonterminal("ContextItemDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(43);                // S^WS | '(:' | 'context'
    shift(101);                     // 'context'
    lookahead1W(55);                // S^WS | '(:' | 'item'
    shift(165);                     // 'item'
    lookahead1W(147);               // S^WS | '(:' | ':=' | 'as' | 'external'
    if (l1 == 79)                   // 'as'
    {
      shift(79);                    // 'as'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_ItemType();
    }
    lookahead1W(106);               // S^WS | '(:' | ':=' | 'external'
    switch (l1)
    {
    case 52:                        // ':='
      shift(52);                    // ':='
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_VarValue();
      break;
    default:
      shift(133);                   // 'external'
      lookahead1W(104);             // S^WS | '(:' | ':=' | ';'
      if (l1 == 52)                 // ':='
      {
        shift(52);                  // ':='
        lookahead1W(266);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        whitespace();
        parse_VarDefaultValue();
      }
    }
    eventHandler.endNonterminal("ContextItemDecl", e0);
  }

  function parse_ParamList()
  {
    eventHandler.startNonterminal("ParamList", e0);
    parse_Param();
    for (;;)
    {
      lookahead1W(101);             // S^WS | '(:' | ')' | ','
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      whitespace();
      parse_Param();
    }
    eventHandler.endNonterminal("ParamList", e0);
  }

  function try_ParamList()
  {
    try_Param();
    for (;;)
    {
      lookahead1W(101);             // S^WS | '(:' | ')' | ','
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      try_Param();
    }
  }

  function parse_Param()
  {
    eventHandler.startNonterminal("Param", e0);
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(143);               // S^WS | '(:' | ')' | ',' | 'as'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_TypeDeclaration();
    }
    eventHandler.endNonterminal("Param", e0);
  }

  function try_Param()
  {
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_EQName();
    lookahead1W(143);               // S^WS | '(:' | ')' | ',' | 'as'
    if (l1 == 79)                   // 'as'
    {
      try_TypeDeclaration();
    }
  }

  function parse_FunctionBody()
  {
    eventHandler.startNonterminal("FunctionBody", e0);
    parse_EnclosedExpr();
    eventHandler.endNonterminal("FunctionBody", e0);
  }

  function try_FunctionBody()
  {
    try_EnclosedExpr();
  }

  function parse_EnclosedExpr()
  {
    eventHandler.startNonterminal("EnclosedExpr", e0);
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("EnclosedExpr", e0);
  }

  function try_EnclosedExpr()
  {
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(282);                    // '}'
  }

  function parse_OptionDecl()
  {
    eventHandler.startNonterminal("OptionDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(66);                // S^WS | '(:' | 'option'
    shift(199);                     // 'option'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(17);                // StringLiteral | S^WS | '(:'
    shift(11);                      // StringLiteral
    eventHandler.endNonterminal("OptionDecl", e0);
  }

  function parse_Expr()
  {
    eventHandler.startNonterminal("Expr", e0);
    parse_ExprSingle();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_ExprSingle();
    }
    eventHandler.endNonterminal("Expr", e0);
  }

  function try_Expr()
  {
    try_ExprSingle();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_ExprSingle();
    }
  }

  function parse_FLWORExpr()
  {
    eventHandler.startNonterminal("FLWORExpr", e0);
    parse_InitialClause();
    for (;;)
    {
      lookahead1W(173);             // S^WS | '(:' | 'count' | 'for' | 'group' | 'let' | 'order' | 'return' | 'stable' |
      if (l1 == 220)                // 'return'
      {
        break;
      }
      whitespace();
      parse_IntermediateClause();
    }
    whitespace();
    parse_ReturnClause();
    eventHandler.endNonterminal("FLWORExpr", e0);
  }

  function try_FLWORExpr()
  {
    try_InitialClause();
    for (;;)
    {
      lookahead1W(173);             // S^WS | '(:' | 'count' | 'for' | 'group' | 'let' | 'order' | 'return' | 'stable' |
      if (l1 == 220)                // 'return'
      {
        break;
      }
      try_IntermediateClause();
    }
    try_ReturnClause();
  }

  function parse_InitialClause()
  {
    eventHandler.startNonterminal("InitialClause", e0);
    switch (l1)
    {
    case 137:                       // 'for'
      lookahead2W(141);             // S^WS | '$' | '(:' | 'sliding' | 'tumbling'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 16009:                     // 'for' '$'
      parse_ForClause();
      break;
    case 174:                       // 'let'
      parse_LetClause();
      break;
    default:
      parse_WindowClause();
    }
    eventHandler.endNonterminal("InitialClause", e0);
  }

  function try_InitialClause()
  {
    switch (l1)
    {
    case 137:                       // 'for'
      lookahead2W(141);             // S^WS | '$' | '(:' | 'sliding' | 'tumbling'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 16009:                     // 'for' '$'
      try_ForClause();
      break;
    case 174:                       // 'let'
      try_LetClause();
      break;
    default:
      try_WindowClause();
    }
  }

  function parse_IntermediateClause()
  {
    eventHandler.startNonterminal("IntermediateClause", e0);
    switch (l1)
    {
    case 137:                       // 'for'
    case 174:                       // 'let'
      parse_InitialClause();
      break;
    case 266:                       // 'where'
      parse_WhereClause();
      break;
    case 148:                       // 'group'
      parse_GroupByClause();
      break;
    case 105:                       // 'count'
      parse_CountClause();
      break;
    default:
      parse_OrderByClause();
    }
    eventHandler.endNonterminal("IntermediateClause", e0);
  }

  function try_IntermediateClause()
  {
    switch (l1)
    {
    case 137:                       // 'for'
    case 174:                       // 'let'
      try_InitialClause();
      break;
    case 266:                       // 'where'
      try_WhereClause();
      break;
    case 148:                       // 'group'
      try_GroupByClause();
      break;
    case 105:                       // 'count'
      try_CountClause();
      break;
    default:
      try_OrderByClause();
    }
  }

  function parse_ForClause()
  {
    eventHandler.startNonterminal("ForClause", e0);
    shift(137);                     // 'for'
    lookahead1W(21);                // S^WS | '$' | '(:'
    whitespace();
    parse_ForBinding();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      whitespace();
      parse_ForBinding();
    }
    eventHandler.endNonterminal("ForClause", e0);
  }

  function try_ForClause()
  {
    shiftT(137);                    // 'for'
    lookahead1W(21);                // S^WS | '$' | '(:'
    try_ForBinding();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      try_ForBinding();
    }
  }

  function parse_ForBinding()
  {
    eventHandler.startNonterminal("ForBinding", e0);
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(164);               // S^WS | '(:' | 'allowing' | 'as' | 'at' | 'in' | 'score'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_TypeDeclaration();
    }
    lookahead1W(158);               // S^WS | '(:' | 'allowing' | 'at' | 'in' | 'score'
    if (l1 == 72)                   // 'allowing'
    {
      whitespace();
      parse_AllowingEmpty();
    }
    lookahead1W(150);               // S^WS | '(:' | 'at' | 'in' | 'score'
    if (l1 == 81)                   // 'at'
    {
      whitespace();
      parse_PositionalVar();
    }
    lookahead1W(122);               // S^WS | '(:' | 'in' | 'score'
    if (l1 == 228)                  // 'score'
    {
      whitespace();
      parse_FTScoreVar();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shift(154);                     // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("ForBinding", e0);
  }

  function try_ForBinding()
  {
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
    lookahead1W(164);               // S^WS | '(:' | 'allowing' | 'as' | 'at' | 'in' | 'score'
    if (l1 == 79)                   // 'as'
    {
      try_TypeDeclaration();
    }
    lookahead1W(158);               // S^WS | '(:' | 'allowing' | 'at' | 'in' | 'score'
    if (l1 == 72)                   // 'allowing'
    {
      try_AllowingEmpty();
    }
    lookahead1W(150);               // S^WS | '(:' | 'at' | 'in' | 'score'
    if (l1 == 81)                   // 'at'
    {
      try_PositionalVar();
    }
    lookahead1W(122);               // S^WS | '(:' | 'in' | 'score'
    if (l1 == 228)                  // 'score'
    {
      try_FTScoreVar();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shiftT(154);                    // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_AllowingEmpty()
  {
    eventHandler.startNonterminal("AllowingEmpty", e0);
    shift(72);                      // 'allowing'
    lookahead1W(49);                // S^WS | '(:' | 'empty'
    shift(123);                     // 'empty'
    eventHandler.endNonterminal("AllowingEmpty", e0);
  }

  function try_AllowingEmpty()
  {
    shiftT(72);                     // 'allowing'
    lookahead1W(49);                // S^WS | '(:' | 'empty'
    shiftT(123);                    // 'empty'
  }

  function parse_PositionalVar()
  {
    eventHandler.startNonterminal("PositionalVar", e0);
    shift(81);                      // 'at'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    eventHandler.endNonterminal("PositionalVar", e0);
  }

  function try_PositionalVar()
  {
    shiftT(81);                     // 'at'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
  }

  function parse_FTScoreVar()
  {
    eventHandler.startNonterminal("FTScoreVar", e0);
    shift(228);                     // 'score'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    eventHandler.endNonterminal("FTScoreVar", e0);
  }

  function try_FTScoreVar()
  {
    shiftT(228);                    // 'score'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
  }

  function parse_LetClause()
  {
    eventHandler.startNonterminal("LetClause", e0);
    shift(174);                     // 'let'
    lookahead1W(96);                // S^WS | '$' | '(:' | 'score'
    whitespace();
    parse_LetBinding();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(96);              // S^WS | '$' | '(:' | 'score'
      whitespace();
      parse_LetBinding();
    }
    eventHandler.endNonterminal("LetClause", e0);
  }

  function try_LetClause()
  {
    shiftT(174);                    // 'let'
    lookahead1W(96);                // S^WS | '$' | '(:' | 'score'
    try_LetBinding();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(96);              // S^WS | '$' | '(:' | 'score'
      try_LetBinding();
    }
  }

  function parse_LetBinding()
  {
    eventHandler.startNonterminal("LetBinding", e0);
    switch (l1)
    {
    case 31:                        // '$'
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_VarName();
      lookahead1W(105);             // S^WS | '(:' | ':=' | 'as'
      if (l1 == 79)                 // 'as'
      {
        whitespace();
        parse_TypeDeclaration();
      }
      break;
    default:
      parse_FTScoreVar();
    }
    lookahead1W(27);                // S^WS | '(:' | ':='
    shift(52);                      // ':='
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("LetBinding", e0);
  }

  function try_LetBinding()
  {
    switch (l1)
    {
    case 31:                        // '$'
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_VarName();
      lookahead1W(105);             // S^WS | '(:' | ':=' | 'as'
      if (l1 == 79)                 // 'as'
      {
        try_TypeDeclaration();
      }
      break;
    default:
      try_FTScoreVar();
    }
    lookahead1W(27);                // S^WS | '(:' | ':='
    shiftT(52);                     // ':='
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_WindowClause()
  {
    eventHandler.startNonterminal("WindowClause", e0);
    shift(137);                     // 'for'
    lookahead1W(135);               // S^WS | '(:' | 'sliding' | 'tumbling'
    switch (l1)
    {
    case 251:                       // 'tumbling'
      whitespace();
      parse_TumblingWindowClause();
      break;
    default:
      whitespace();
      parse_SlidingWindowClause();
    }
    eventHandler.endNonterminal("WindowClause", e0);
  }

  function try_WindowClause()
  {
    shiftT(137);                    // 'for'
    lookahead1W(135);               // S^WS | '(:' | 'sliding' | 'tumbling'
    switch (l1)
    {
    case 251:                       // 'tumbling'
      try_TumblingWindowClause();
      break;
    default:
      try_SlidingWindowClause();
    }
  }

  function parse_TumblingWindowClause()
  {
    eventHandler.startNonterminal("TumblingWindowClause", e0);
    shift(251);                     // 'tumbling'
    lookahead1W(85);                // S^WS | '(:' | 'window'
    shift(269);                     // 'window'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(110);               // S^WS | '(:' | 'as' | 'in'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_TypeDeclaration();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shift(154);                     // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    whitespace();
    parse_WindowStartCondition();
    if (l1 == 126                   // 'end'
     || l1 == 198)                  // 'only'
    {
      whitespace();
      parse_WindowEndCondition();
    }
    eventHandler.endNonterminal("TumblingWindowClause", e0);
  }

  function try_TumblingWindowClause()
  {
    shiftT(251);                    // 'tumbling'
    lookahead1W(85);                // S^WS | '(:' | 'window'
    shiftT(269);                    // 'window'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
    lookahead1W(110);               // S^WS | '(:' | 'as' | 'in'
    if (l1 == 79)                   // 'as'
    {
      try_TypeDeclaration();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shiftT(154);                    // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
    try_WindowStartCondition();
    if (l1 == 126                   // 'end'
     || l1 == 198)                  // 'only'
    {
      try_WindowEndCondition();
    }
  }

  function parse_SlidingWindowClause()
  {
    eventHandler.startNonterminal("SlidingWindowClause", e0);
    shift(234);                     // 'sliding'
    lookahead1W(85);                // S^WS | '(:' | 'window'
    shift(269);                     // 'window'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(110);               // S^WS | '(:' | 'as' | 'in'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_TypeDeclaration();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shift(154);                     // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    whitespace();
    parse_WindowStartCondition();
    whitespace();
    parse_WindowEndCondition();
    eventHandler.endNonterminal("SlidingWindowClause", e0);
  }

  function try_SlidingWindowClause()
  {
    shiftT(234);                    // 'sliding'
    lookahead1W(85);                // S^WS | '(:' | 'window'
    shiftT(269);                    // 'window'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
    lookahead1W(110);               // S^WS | '(:' | 'as' | 'in'
    if (l1 == 79)                   // 'as'
    {
      try_TypeDeclaration();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shiftT(154);                    // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
    try_WindowStartCondition();
    try_WindowEndCondition();
  }

  function parse_WindowStartCondition()
  {
    eventHandler.startNonterminal("WindowStartCondition", e0);
    shift(237);                     // 'start'
    lookahead1W(163);               // S^WS | '$' | '(:' | 'at' | 'next' | 'previous' | 'when'
    whitespace();
    parse_WindowVars();
    lookahead1W(83);                // S^WS | '(:' | 'when'
    shift(265);                     // 'when'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("WindowStartCondition", e0);
  }

  function try_WindowStartCondition()
  {
    shiftT(237);                    // 'start'
    lookahead1W(163);               // S^WS | '$' | '(:' | 'at' | 'next' | 'previous' | 'when'
    try_WindowVars();
    lookahead1W(83);                // S^WS | '(:' | 'when'
    shiftT(265);                    // 'when'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_WindowEndCondition()
  {
    eventHandler.startNonterminal("WindowEndCondition", e0);
    if (l1 == 198)                  // 'only'
    {
      shift(198);                   // 'only'
    }
    lookahead1W(50);                // S^WS | '(:' | 'end'
    shift(126);                     // 'end'
    lookahead1W(163);               // S^WS | '$' | '(:' | 'at' | 'next' | 'previous' | 'when'
    whitespace();
    parse_WindowVars();
    lookahead1W(83);                // S^WS | '(:' | 'when'
    shift(265);                     // 'when'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("WindowEndCondition", e0);
  }

  function try_WindowEndCondition()
  {
    if (l1 == 198)                  // 'only'
    {
      shiftT(198);                  // 'only'
    }
    lookahead1W(50);                // S^WS | '(:' | 'end'
    shiftT(126);                    // 'end'
    lookahead1W(163);               // S^WS | '$' | '(:' | 'at' | 'next' | 'previous' | 'when'
    try_WindowVars();
    lookahead1W(83);                // S^WS | '(:' | 'when'
    shiftT(265);                    // 'when'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_WindowVars()
  {
    eventHandler.startNonterminal("WindowVars", e0);
    if (l1 == 31)                   // '$'
    {
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_CurrentItem();
    }
    lookahead1W(159);               // S^WS | '(:' | 'at' | 'next' | 'previous' | 'when'
    if (l1 == 81)                   // 'at'
    {
      whitespace();
      parse_PositionalVar();
    }
    lookahead1W(153);               // S^WS | '(:' | 'next' | 'previous' | 'when'
    if (l1 == 215)                  // 'previous'
    {
      shift(215);                   // 'previous'
      lookahead1W(21);              // S^WS | '$' | '(:'
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_PreviousItem();
    }
    lookahead1W(127);               // S^WS | '(:' | 'next' | 'when'
    if (l1 == 187)                  // 'next'
    {
      shift(187);                   // 'next'
      lookahead1W(21);              // S^WS | '$' | '(:'
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_NextItem();
    }
    eventHandler.endNonterminal("WindowVars", e0);
  }

  function try_WindowVars()
  {
    if (l1 == 31)                   // '$'
    {
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_CurrentItem();
    }
    lookahead1W(159);               // S^WS | '(:' | 'at' | 'next' | 'previous' | 'when'
    if (l1 == 81)                   // 'at'
    {
      try_PositionalVar();
    }
    lookahead1W(153);               // S^WS | '(:' | 'next' | 'previous' | 'when'
    if (l1 == 215)                  // 'previous'
    {
      shiftT(215);                  // 'previous'
      lookahead1W(21);              // S^WS | '$' | '(:'
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_PreviousItem();
    }
    lookahead1W(127);               // S^WS | '(:' | 'next' | 'when'
    if (l1 == 187)                  // 'next'
    {
      shiftT(187);                  // 'next'
      lookahead1W(21);              // S^WS | '$' | '(:'
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_NextItem();
    }
  }

  function parse_CurrentItem()
  {
    eventHandler.startNonterminal("CurrentItem", e0);
    parse_EQName();
    eventHandler.endNonterminal("CurrentItem", e0);
  }

  function try_CurrentItem()
  {
    try_EQName();
  }

  function parse_PreviousItem()
  {
    eventHandler.startNonterminal("PreviousItem", e0);
    parse_EQName();
    eventHandler.endNonterminal("PreviousItem", e0);
  }

  function try_PreviousItem()
  {
    try_EQName();
  }

  function parse_NextItem()
  {
    eventHandler.startNonterminal("NextItem", e0);
    parse_EQName();
    eventHandler.endNonterminal("NextItem", e0);
  }

  function try_NextItem()
  {
    try_EQName();
  }

  function parse_CountClause()
  {
    eventHandler.startNonterminal("CountClause", e0);
    shift(105);                     // 'count'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    eventHandler.endNonterminal("CountClause", e0);
  }

  function try_CountClause()
  {
    shiftT(105);                    // 'count'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
  }

  function parse_WhereClause()
  {
    eventHandler.startNonterminal("WhereClause", e0);
    shift(266);                     // 'where'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("WhereClause", e0);
  }

  function try_WhereClause()
  {
    shiftT(266);                    // 'where'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_GroupByClause()
  {
    eventHandler.startNonterminal("GroupByClause", e0);
    shift(148);                     // 'group'
    lookahead1W(34);                // S^WS | '(:' | 'by'
    shift(87);                      // 'by'
    lookahead1W(21);                // S^WS | '$' | '(:'
    whitespace();
    parse_GroupingSpecList();
    eventHandler.endNonterminal("GroupByClause", e0);
  }

  function try_GroupByClause()
  {
    shiftT(148);                    // 'group'
    lookahead1W(34);                // S^WS | '(:' | 'by'
    shiftT(87);                     // 'by'
    lookahead1W(21);                // S^WS | '$' | '(:'
    try_GroupingSpecList();
  }

  function parse_GroupingSpecList()
  {
    eventHandler.startNonterminal("GroupingSpecList", e0);
    parse_GroupingSpec();
    for (;;)
    {
      lookahead1W(176);             // S^WS | '(:' | ',' | 'count' | 'for' | 'group' | 'let' | 'order' | 'return' |
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      whitespace();
      parse_GroupingSpec();
    }
    eventHandler.endNonterminal("GroupingSpecList", e0);
  }

  function try_GroupingSpecList()
  {
    try_GroupingSpec();
    for (;;)
    {
      lookahead1W(176);             // S^WS | '(:' | ',' | 'count' | 'for' | 'group' | 'let' | 'order' | 'return' |
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      try_GroupingSpec();
    }
  }

  function parse_GroupingSpec()
  {
    eventHandler.startNonterminal("GroupingSpec", e0);
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(183);               // S^WS | '(:' | ',' | ':=' | 'as' | 'collation' | 'count' | 'for' | 'group' |
    if (l1 == 52                    // ':='
     || l1 == 79)                   // 'as'
    {
      if (l1 == 79)                 // 'as'
      {
        whitespace();
        parse_TypeDeclaration();
      }
      lookahead1W(27);              // S^WS | '(:' | ':='
      shift(52);                    // ':='
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_ExprSingle();
    }
    if (l1 == 94)                   // 'collation'
    {
      shift(94);                    // 'collation'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shift(7);                     // URILiteral
    }
    eventHandler.endNonterminal("GroupingSpec", e0);
  }

  function try_GroupingSpec()
  {
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
    lookahead1W(183);               // S^WS | '(:' | ',' | ':=' | 'as' | 'collation' | 'count' | 'for' | 'group' |
    if (l1 == 52                    // ':='
     || l1 == 79)                   // 'as'
    {
      if (l1 == 79)                 // 'as'
      {
        try_TypeDeclaration();
      }
      lookahead1W(27);              // S^WS | '(:' | ':='
      shiftT(52);                   // ':='
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_ExprSingle();
    }
    if (l1 == 94)                   // 'collation'
    {
      shiftT(94);                   // 'collation'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shiftT(7);                    // URILiteral
    }
  }

  function parse_OrderByClause()
  {
    eventHandler.startNonterminal("OrderByClause", e0);
    switch (l1)
    {
    case 201:                       // 'order'
      shift(201);                   // 'order'
      lookahead1W(34);              // S^WS | '(:' | 'by'
      shift(87);                    // 'by'
      break;
    default:
      shift(236);                   // 'stable'
      lookahead1W(67);              // S^WS | '(:' | 'order'
      shift(201);                   // 'order'
      lookahead1W(34);              // S^WS | '(:' | 'by'
      shift(87);                    // 'by'
    }
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_OrderSpecList();
    eventHandler.endNonterminal("OrderByClause", e0);
  }

  function try_OrderByClause()
  {
    switch (l1)
    {
    case 201:                       // 'order'
      shiftT(201);                  // 'order'
      lookahead1W(34);              // S^WS | '(:' | 'by'
      shiftT(87);                   // 'by'
      break;
    default:
      shiftT(236);                  // 'stable'
      lookahead1W(67);              // S^WS | '(:' | 'order'
      shiftT(201);                  // 'order'
      lookahead1W(34);              // S^WS | '(:' | 'by'
      shiftT(87);                   // 'by'
    }
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_OrderSpecList();
  }

  function parse_OrderSpecList()
  {
    eventHandler.startNonterminal("OrderSpecList", e0);
    parse_OrderSpec();
    for (;;)
    {
      lookahead1W(176);             // S^WS | '(:' | ',' | 'count' | 'for' | 'group' | 'let' | 'order' | 'return' |
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_OrderSpec();
    }
    eventHandler.endNonterminal("OrderSpecList", e0);
  }

  function try_OrderSpecList()
  {
    try_OrderSpec();
    for (;;)
    {
      lookahead1W(176);             // S^WS | '(:' | ',' | 'count' | 'for' | 'group' | 'let' | 'order' | 'return' |
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_OrderSpec();
    }
  }

  function parse_OrderSpec()
  {
    eventHandler.startNonterminal("OrderSpec", e0);
    parse_ExprSingle();
    whitespace();
    parse_OrderModifier();
    eventHandler.endNonterminal("OrderSpec", e0);
  }

  function try_OrderSpec()
  {
    try_ExprSingle();
    try_OrderModifier();
  }

  function parse_OrderModifier()
  {
    eventHandler.startNonterminal("OrderModifier", e0);
    if (l1 == 80                    // 'ascending'
     || l1 == 113)                  // 'descending'
    {
      switch (l1)
      {
      case 80:                      // 'ascending'
        shift(80);                  // 'ascending'
        break;
      default:
        shift(113);                 // 'descending'
      }
    }
    lookahead1W(180);               // S^WS | '(:' | ',' | 'collation' | 'count' | 'empty' | 'for' | 'group' | 'let' |
    if (l1 == 123)                  // 'empty'
    {
      shift(123);                   // 'empty'
      lookahead1W(121);             // S^WS | '(:' | 'greatest' | 'least'
      switch (l1)
      {
      case 147:                     // 'greatest'
        shift(147);                 // 'greatest'
        break;
      default:
        shift(173);                 // 'least'
      }
    }
    lookahead1W(177);               // S^WS | '(:' | ',' | 'collation' | 'count' | 'for' | 'group' | 'let' | 'order' |
    if (l1 == 94)                   // 'collation'
    {
      shift(94);                    // 'collation'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shift(7);                     // URILiteral
    }
    eventHandler.endNonterminal("OrderModifier", e0);
  }

  function try_OrderModifier()
  {
    if (l1 == 80                    // 'ascending'
     || l1 == 113)                  // 'descending'
    {
      switch (l1)
      {
      case 80:                      // 'ascending'
        shiftT(80);                 // 'ascending'
        break;
      default:
        shiftT(113);                // 'descending'
      }
    }
    lookahead1W(180);               // S^WS | '(:' | ',' | 'collation' | 'count' | 'empty' | 'for' | 'group' | 'let' |
    if (l1 == 123)                  // 'empty'
    {
      shiftT(123);                  // 'empty'
      lookahead1W(121);             // S^WS | '(:' | 'greatest' | 'least'
      switch (l1)
      {
      case 147:                     // 'greatest'
        shiftT(147);                // 'greatest'
        break;
      default:
        shiftT(173);                // 'least'
      }
    }
    lookahead1W(177);               // S^WS | '(:' | ',' | 'collation' | 'count' | 'for' | 'group' | 'let' | 'order' |
    if (l1 == 94)                   // 'collation'
    {
      shiftT(94);                   // 'collation'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shiftT(7);                    // URILiteral
    }
  }

  function parse_ReturnClause()
  {
    eventHandler.startNonterminal("ReturnClause", e0);
    shift(220);                     // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("ReturnClause", e0);
  }

  function try_ReturnClause()
  {
    shiftT(220);                    // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_QuantifiedExpr()
  {
    eventHandler.startNonterminal("QuantifiedExpr", e0);
    switch (l1)
    {
    case 235:                       // 'some'
      shift(235);                   // 'some'
      break;
    default:
      shift(129);                   // 'every'
    }
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(110);               // S^WS | '(:' | 'as' | 'in'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_TypeDeclaration();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shift(154);                     // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_VarName();
      lookahead1W(110);             // S^WS | '(:' | 'as' | 'in'
      if (l1 == 79)                 // 'as'
      {
        whitespace();
        parse_TypeDeclaration();
      }
      lookahead1W(53);              // S^WS | '(:' | 'in'
      shift(154);                   // 'in'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_ExprSingle();
    }
    shift(224);                     // 'satisfies'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("QuantifiedExpr", e0);
  }

  function try_QuantifiedExpr()
  {
    switch (l1)
    {
    case 235:                       // 'some'
      shiftT(235);                  // 'some'
      break;
    default:
      shiftT(129);                  // 'every'
    }
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
    lookahead1W(110);               // S^WS | '(:' | 'as' | 'in'
    if (l1 == 79)                   // 'as'
    {
      try_TypeDeclaration();
    }
    lookahead1W(53);                // S^WS | '(:' | 'in'
    shiftT(154);                    // 'in'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_VarName();
      lookahead1W(110);             // S^WS | '(:' | 'as' | 'in'
      if (l1 == 79)                 // 'as'
      {
        try_TypeDeclaration();
      }
      lookahead1W(53);              // S^WS | '(:' | 'in'
      shiftT(154);                  // 'in'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_ExprSingle();
    }
    shiftT(224);                    // 'satisfies'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_SwitchExpr()
  {
    eventHandler.startNonterminal("SwitchExpr", e0);
    shift(243);                     // 'switch'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(37);                      // ')'
    for (;;)
    {
      lookahead1W(35);              // S^WS | '(:' | 'case'
      whitespace();
      parse_SwitchCaseClause();
      if (l1 != 88)                 // 'case'
      {
        break;
      }
    }
    shift(109);                     // 'default'
    lookahead1W(70);                // S^WS | '(:' | 'return'
    shift(220);                     // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("SwitchExpr", e0);
  }

  function try_SwitchExpr()
  {
    shiftT(243);                    // 'switch'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(37);                     // ')'
    for (;;)
    {
      lookahead1W(35);              // S^WS | '(:' | 'case'
      try_SwitchCaseClause();
      if (l1 != 88)                 // 'case'
      {
        break;
      }
    }
    shiftT(109);                    // 'default'
    lookahead1W(70);                // S^WS | '(:' | 'return'
    shiftT(220);                    // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_SwitchCaseClause()
  {
    eventHandler.startNonterminal("SwitchCaseClause", e0);
    for (;;)
    {
      shift(88);                    // 'case'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_SwitchCaseOperand();
      if (l1 != 88)                 // 'case'
      {
        break;
      }
    }
    shift(220);                     // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("SwitchCaseClause", e0);
  }

  function try_SwitchCaseClause()
  {
    for (;;)
    {
      shiftT(88);                   // 'case'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_SwitchCaseOperand();
      if (l1 != 88)                 // 'case'
      {
        break;
      }
    }
    shiftT(220);                    // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_SwitchCaseOperand()
  {
    eventHandler.startNonterminal("SwitchCaseOperand", e0);
    parse_ExprSingle();
    eventHandler.endNonterminal("SwitchCaseOperand", e0);
  }

  function try_SwitchCaseOperand()
  {
    try_ExprSingle();
  }

  function parse_TypeswitchExpr()
  {
    eventHandler.startNonterminal("TypeswitchExpr", e0);
    shift(253);                     // 'typeswitch'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(37);                      // ')'
    for (;;)
    {
      lookahead1W(35);              // S^WS | '(:' | 'case'
      whitespace();
      parse_CaseClause();
      if (l1 != 88)                 // 'case'
      {
        break;
      }
    }
    shift(109);                     // 'default'
    lookahead1W(95);                // S^WS | '$' | '(:' | 'return'
    if (l1 == 31)                   // '$'
    {
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_VarName();
    }
    lookahead1W(70);                // S^WS | '(:' | 'return'
    shift(220);                     // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("TypeswitchExpr", e0);
  }

  function try_TypeswitchExpr()
  {
    shiftT(253);                    // 'typeswitch'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(37);                     // ')'
    for (;;)
    {
      lookahead1W(35);              // S^WS | '(:' | 'case'
      try_CaseClause();
      if (l1 != 88)                 // 'case'
      {
        break;
      }
    }
    shiftT(109);                    // 'default'
    lookahead1W(95);                // S^WS | '$' | '(:' | 'return'
    if (l1 == 31)                   // '$'
    {
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_VarName();
    }
    lookahead1W(70);                // S^WS | '(:' | 'return'
    shiftT(220);                    // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_CaseClause()
  {
    eventHandler.startNonterminal("CaseClause", e0);
    shift(88);                      // 'case'
    lookahead1W(260);               // EQName^Token | S^WS | '$' | '%' | '(' | '(:' | 'after' | 'allowing' |
    if (l1 == 31)                   // '$'
    {
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_VarName();
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shift(79);                    // 'as'
    }
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_SequenceTypeUnion();
    shift(220);                     // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("CaseClause", e0);
  }

  function try_CaseClause()
  {
    shiftT(88);                     // 'case'
    lookahead1W(260);               // EQName^Token | S^WS | '$' | '%' | '(' | '(:' | 'after' | 'allowing' |
    if (l1 == 31)                   // '$'
    {
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_VarName();
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shiftT(79);                   // 'as'
    }
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_SequenceTypeUnion();
    shiftT(220);                    // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_SequenceTypeUnion()
  {
    eventHandler.startNonterminal("SequenceTypeUnion", e0);
    parse_SequenceType();
    for (;;)
    {
      lookahead1W(134);             // S^WS | '(:' | 'return' | '|'
      if (l1 != 279)                // '|'
      {
        break;
      }
      shift(279);                   // '|'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_SequenceType();
    }
    eventHandler.endNonterminal("SequenceTypeUnion", e0);
  }

  function try_SequenceTypeUnion()
  {
    try_SequenceType();
    for (;;)
    {
      lookahead1W(134);             // S^WS | '(:' | 'return' | '|'
      if (l1 != 279)                // '|'
      {
        break;
      }
      shiftT(279);                  // '|'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_SequenceType();
    }
  }

  function parse_IfExpr()
  {
    eventHandler.startNonterminal("IfExpr", e0);
    shift(152);                     // 'if'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(37);                      // ')'
    lookahead1W(77);                // S^WS | '(:' | 'then'
    shift(245);                     // 'then'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    shift(122);                     // 'else'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("IfExpr", e0);
  }

  function try_IfExpr()
  {
    shiftT(152);                    // 'if'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(37);                     // ')'
    lookahead1W(77);                // S^WS | '(:' | 'then'
    shiftT(245);                    // 'then'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
    shiftT(122);                    // 'else'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_TryCatchExpr()
  {
    eventHandler.startNonterminal("TryCatchExpr", e0);
    parse_TryClause();
    for (;;)
    {
      lookahead1W(36);              // S^WS | '(:' | 'catch'
      whitespace();
      parse_CatchClause();
      lookahead1W(184);             // S^WS | EOF | '(:' | ')' | ',' | ':' | ';' | ']' | 'after' | 'as' | 'ascending' |
      if (l1 != 91)                 // 'catch'
      {
        break;
      }
    }
    eventHandler.endNonterminal("TryCatchExpr", e0);
  }

  function try_TryCatchExpr()
  {
    try_TryClause();
    for (;;)
    {
      lookahead1W(36);              // S^WS | '(:' | 'catch'
      try_CatchClause();
      lookahead1W(184);             // S^WS | EOF | '(:' | ')' | ',' | ':' | ';' | ']' | 'after' | 'as' | 'ascending' |
      if (l1 != 91)                 // 'catch'
      {
        break;
      }
    }
  }

  function parse_TryClause()
  {
    eventHandler.startNonterminal("TryClause", e0);
    shift(250);                     // 'try'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_TryTargetExpr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("TryClause", e0);
  }

  function try_TryClause()
  {
    shiftT(250);                    // 'try'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_TryTargetExpr();
    shiftT(282);                    // '}'
  }

  function parse_TryTargetExpr()
  {
    eventHandler.startNonterminal("TryTargetExpr", e0);
    parse_Expr();
    eventHandler.endNonterminal("TryTargetExpr", e0);
  }

  function try_TryTargetExpr()
  {
    try_Expr();
  }

  function parse_CatchClause()
  {
    eventHandler.startNonterminal("CatchClause", e0);
    shift(91);                      // 'catch'
    lookahead1W(251);               // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_CatchErrorList();
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("CatchClause", e0);
  }

  function try_CatchClause()
  {
    shiftT(91);                     // 'catch'
    lookahead1W(251);               // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_CatchErrorList();
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(282);                    // '}'
  }

  function parse_CatchErrorList()
  {
    eventHandler.startNonterminal("CatchErrorList", e0);
    parse_NameTest();
    for (;;)
    {
      lookahead1W(136);             // S^WS | '(:' | '{' | '|'
      if (l1 != 279)                // '|'
      {
        break;
      }
      shift(279);                   // '|'
      lookahead1W(251);             // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_NameTest();
    }
    eventHandler.endNonterminal("CatchErrorList", e0);
  }

  function try_CatchErrorList()
  {
    try_NameTest();
    for (;;)
    {
      lookahead1W(136);             // S^WS | '(:' | '{' | '|'
      if (l1 != 279)                // '|'
      {
        break;
      }
      shiftT(279);                  // '|'
      lookahead1W(251);             // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_NameTest();
    }
  }

  function parse_OrExpr()
  {
    eventHandler.startNonterminal("OrExpr", e0);
    parse_AndExpr();
    for (;;)
    {
      if (l1 != 200)                // 'or'
      {
        break;
      }
      shift(200);                   // 'or'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_AndExpr();
    }
    eventHandler.endNonterminal("OrExpr", e0);
  }

  function try_OrExpr()
  {
    try_AndExpr();
    for (;;)
    {
      if (l1 != 200)                // 'or'
      {
        break;
      }
      shiftT(200);                  // 'or'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_AndExpr();
    }
  }

  function parse_AndExpr()
  {
    eventHandler.startNonterminal("AndExpr", e0);
    parse_ComparisonExpr();
    for (;;)
    {
      if (l1 != 75)                 // 'and'
      {
        break;
      }
      shift(75);                    // 'and'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_ComparisonExpr();
    }
    eventHandler.endNonterminal("AndExpr", e0);
  }

  function try_AndExpr()
  {
    try_ComparisonExpr();
    for (;;)
    {
      if (l1 != 75)                 // 'and'
      {
        break;
      }
      shiftT(75);                   // 'and'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_ComparisonExpr();
    }
  }

  function parse_ComparisonExpr()
  {
    eventHandler.startNonterminal("ComparisonExpr", e0);
    parse_FTContainsExpr();
    if (l1 == 27                    // '!='
     || l1 == 54                    // '<'
     || l1 == 57                    // '<<'
     || l1 == 58                    // '<='
     || l1 == 60                    // '='
     || l1 == 61                    // '>'
     || l1 == 62                    // '>='
     || l1 == 63                    // '>>'
     || l1 == 128                   // 'eq'
     || l1 == 146                   // 'ge'
     || l1 == 150                   // 'gt'
     || l1 == 164                   // 'is'
     || l1 == 172                   // 'le'
     || l1 == 178                   // 'lt'
     || l1 == 186)                  // 'ne'
    {
      switch (l1)
      {
      case 128:                     // 'eq'
      case 146:                     // 'ge'
      case 150:                     // 'gt'
      case 172:                     // 'le'
      case 178:                     // 'lt'
      case 186:                     // 'ne'
        whitespace();
        parse_ValueComp();
        break;
      case 57:                      // '<<'
      case 63:                      // '>>'
      case 164:                     // 'is'
        whitespace();
        parse_NodeComp();
        break;
      default:
        whitespace();
        parse_GeneralComp();
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_FTContainsExpr();
    }
    eventHandler.endNonterminal("ComparisonExpr", e0);
  }

  function try_ComparisonExpr()
  {
    try_FTContainsExpr();
    if (l1 == 27                    // '!='
     || l1 == 54                    // '<'
     || l1 == 57                    // '<<'
     || l1 == 58                    // '<='
     || l1 == 60                    // '='
     || l1 == 61                    // '>'
     || l1 == 62                    // '>='
     || l1 == 63                    // '>>'
     || l1 == 128                   // 'eq'
     || l1 == 146                   // 'ge'
     || l1 == 150                   // 'gt'
     || l1 == 164                   // 'is'
     || l1 == 172                   // 'le'
     || l1 == 178                   // 'lt'
     || l1 == 186)                  // 'ne'
    {
      switch (l1)
      {
      case 128:                     // 'eq'
      case 146:                     // 'ge'
      case 150:                     // 'gt'
      case 172:                     // 'le'
      case 178:                     // 'lt'
      case 186:                     // 'ne'
        try_ValueComp();
        break;
      case 57:                      // '<<'
      case 63:                      // '>>'
      case 164:                     // 'is'
        try_NodeComp();
        break;
      default:
        try_GeneralComp();
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_FTContainsExpr();
    }
  }

  function parse_FTContainsExpr()
  {
    eventHandler.startNonterminal("FTContainsExpr", e0);
    parse_StringConcatExpr();
    if (l1 == 99)                   // 'contains'
    {
      shift(99);                    // 'contains'
      lookahead1W(76);              // S^WS | '(:' | 'text'
      shift(244);                   // 'text'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      whitespace();
      parse_FTSelection();
      if (l1 == 271)                // 'without'
      {
        whitespace();
        parse_FTIgnoreOption();
      }
    }
    eventHandler.endNonterminal("FTContainsExpr", e0);
  }

  function try_FTContainsExpr()
  {
    try_StringConcatExpr();
    if (l1 == 99)                   // 'contains'
    {
      shiftT(99);                   // 'contains'
      lookahead1W(76);              // S^WS | '(:' | 'text'
      shiftT(244);                  // 'text'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      try_FTSelection();
      if (l1 == 271)                // 'without'
      {
        try_FTIgnoreOption();
      }
    }
  }

  function parse_StringConcatExpr()
  {
    eventHandler.startNonterminal("StringConcatExpr", e0);
    parse_RangeExpr();
    for (;;)
    {
      if (l1 != 280)                // '||'
      {
        break;
      }
      shift(280);                   // '||'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_RangeExpr();
    }
    eventHandler.endNonterminal("StringConcatExpr", e0);
  }

  function try_StringConcatExpr()
  {
    try_RangeExpr();
    for (;;)
    {
      if (l1 != 280)                // '||'
      {
        break;
      }
      shiftT(280);                  // '||'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_RangeExpr();
    }
  }

  function parse_RangeExpr()
  {
    eventHandler.startNonterminal("RangeExpr", e0);
    parse_AdditiveExpr();
    if (l1 == 248)                  // 'to'
    {
      shift(248);                   // 'to'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_AdditiveExpr();
    }
    eventHandler.endNonterminal("RangeExpr", e0);
  }

  function try_RangeExpr()
  {
    try_AdditiveExpr();
    if (l1 == 248)                  // 'to'
    {
      shiftT(248);                  // 'to'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_AdditiveExpr();
    }
  }

  function parse_AdditiveExpr()
  {
    eventHandler.startNonterminal("AdditiveExpr", e0);
    parse_MultiplicativeExpr();
    for (;;)
    {
      if (l1 != 40                  // '+'
       && l1 != 42)                 // '-'
      {
        break;
      }
      switch (l1)
      {
      case 40:                      // '+'
        shift(40);                  // '+'
        break;
      default:
        shift(42);                  // '-'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_MultiplicativeExpr();
    }
    eventHandler.endNonterminal("AdditiveExpr", e0);
  }

  function try_AdditiveExpr()
  {
    try_MultiplicativeExpr();
    for (;;)
    {
      if (l1 != 40                  // '+'
       && l1 != 42)                 // '-'
      {
        break;
      }
      switch (l1)
      {
      case 40:                      // '+'
        shiftT(40);                 // '+'
        break;
      default:
        shiftT(42);                 // '-'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_MultiplicativeExpr();
    }
  }

  function parse_MultiplicativeExpr()
  {
    eventHandler.startNonterminal("MultiplicativeExpr", e0);
    parse_UnionExpr();
    for (;;)
    {
      if (l1 != 38                  // '*'
       && l1 != 118                 // 'div'
       && l1 != 151                 // 'idiv'
       && l1 != 180)                // 'mod'
      {
        break;
      }
      switch (l1)
      {
      case 38:                      // '*'
        shift(38);                  // '*'
        break;
      case 118:                     // 'div'
        shift(118);                 // 'div'
        break;
      case 151:                     // 'idiv'
        shift(151);                 // 'idiv'
        break;
      default:
        shift(180);                 // 'mod'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_UnionExpr();
    }
    eventHandler.endNonterminal("MultiplicativeExpr", e0);
  }

  function try_MultiplicativeExpr()
  {
    try_UnionExpr();
    for (;;)
    {
      if (l1 != 38                  // '*'
       && l1 != 118                 // 'div'
       && l1 != 151                 // 'idiv'
       && l1 != 180)                // 'mod'
      {
        break;
      }
      switch (l1)
      {
      case 38:                      // '*'
        shiftT(38);                 // '*'
        break;
      case 118:                     // 'div'
        shiftT(118);                // 'div'
        break;
      case 151:                     // 'idiv'
        shiftT(151);                // 'idiv'
        break;
      default:
        shiftT(180);                // 'mod'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_UnionExpr();
    }
  }

  function parse_UnionExpr()
  {
    eventHandler.startNonterminal("UnionExpr", e0);
    parse_IntersectExceptExpr();
    for (;;)
    {
      if (l1 != 254                 // 'union'
       && l1 != 279)                // '|'
      {
        break;
      }
      switch (l1)
      {
      case 254:                     // 'union'
        shift(254);                 // 'union'
        break;
      default:
        shift(279);                 // '|'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_IntersectExceptExpr();
    }
    eventHandler.endNonterminal("UnionExpr", e0);
  }

  function try_UnionExpr()
  {
    try_IntersectExceptExpr();
    for (;;)
    {
      if (l1 != 254                 // 'union'
       && l1 != 279)                // '|'
      {
        break;
      }
      switch (l1)
      {
      case 254:                     // 'union'
        shiftT(254);                // 'union'
        break;
      default:
        shiftT(279);                // '|'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_IntersectExceptExpr();
    }
  }

  function parse_IntersectExceptExpr()
  {
    eventHandler.startNonterminal("IntersectExceptExpr", e0);
    parse_InstanceofExpr();
    for (;;)
    {
      lookahead1W(222);             // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
      if (l1 != 131                 // 'except'
       && l1 != 162)                // 'intersect'
      {
        break;
      }
      switch (l1)
      {
      case 162:                     // 'intersect'
        shift(162);                 // 'intersect'
        break;
      default:
        shift(131);                 // 'except'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_InstanceofExpr();
    }
    eventHandler.endNonterminal("IntersectExceptExpr", e0);
  }

  function try_IntersectExceptExpr()
  {
    try_InstanceofExpr();
    for (;;)
    {
      lookahead1W(222);             // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
      if (l1 != 131                 // 'except'
       && l1 != 162)                // 'intersect'
      {
        break;
      }
      switch (l1)
      {
      case 162:                     // 'intersect'
        shiftT(162);                // 'intersect'
        break;
      default:
        shiftT(131);                // 'except'
      }
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_InstanceofExpr();
    }
  }

  function parse_InstanceofExpr()
  {
    eventHandler.startNonterminal("InstanceofExpr", e0);
    parse_TreatExpr();
    lookahead1W(223);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 160)                  // 'instance'
    {
      shift(160);                   // 'instance'
      lookahead1W(64);              // S^WS | '(:' | 'of'
      shift(196);                   // 'of'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_SequenceType();
    }
    eventHandler.endNonterminal("InstanceofExpr", e0);
  }

  function try_InstanceofExpr()
  {
    try_TreatExpr();
    lookahead1W(223);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 160)                  // 'instance'
    {
      shiftT(160);                  // 'instance'
      lookahead1W(64);              // S^WS | '(:' | 'of'
      shiftT(196);                  // 'of'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_SequenceType();
    }
  }

  function parse_TreatExpr()
  {
    eventHandler.startNonterminal("TreatExpr", e0);
    parse_CastableExpr();
    lookahead1W(224);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 249)                  // 'treat'
    {
      shift(249);                   // 'treat'
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shift(79);                    // 'as'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_SequenceType();
    }
    eventHandler.endNonterminal("TreatExpr", e0);
  }

  function try_TreatExpr()
  {
    try_CastableExpr();
    lookahead1W(224);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 249)                  // 'treat'
    {
      shiftT(249);                  // 'treat'
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shiftT(79);                   // 'as'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_SequenceType();
    }
  }

  function parse_CastableExpr()
  {
    eventHandler.startNonterminal("CastableExpr", e0);
    parse_CastExpr();
    lookahead1W(225);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 90)                   // 'castable'
    {
      shift(90);                    // 'castable'
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shift(79);                    // 'as'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_SingleType();
    }
    eventHandler.endNonterminal("CastableExpr", e0);
  }

  function try_CastableExpr()
  {
    try_CastExpr();
    lookahead1W(225);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 90)                   // 'castable'
    {
      shiftT(90);                   // 'castable'
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shiftT(79);                   // 'as'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_SingleType();
    }
  }

  function parse_CastExpr()
  {
    eventHandler.startNonterminal("CastExpr", e0);
    parse_UnaryExpr();
    lookahead1W(227);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 89)                   // 'cast'
    {
      shift(89);                    // 'cast'
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shift(79);                    // 'as'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_SingleType();
    }
    eventHandler.endNonterminal("CastExpr", e0);
  }

  function try_CastExpr()
  {
    try_UnaryExpr();
    lookahead1W(227);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 89)                   // 'cast'
    {
      shiftT(89);                   // 'cast'
      lookahead1W(30);              // S^WS | '(:' | 'as'
      shiftT(79);                   // 'as'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_SingleType();
    }
  }

  function parse_UnaryExpr()
  {
    eventHandler.startNonterminal("UnaryExpr", e0);
    for (;;)
    {
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      if (l1 != 40                  // '+'
       && l1 != 42)                 // '-'
      {
        break;
      }
      switch (l1)
      {
      case 42:                      // '-'
        shift(42);                  // '-'
        break;
      default:
        shift(40);                  // '+'
      }
    }
    whitespace();
    parse_ValueExpr();
    eventHandler.endNonterminal("UnaryExpr", e0);
  }

  function try_UnaryExpr()
  {
    for (;;)
    {
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      if (l1 != 40                  // '+'
       && l1 != 42)                 // '-'
      {
        break;
      }
      switch (l1)
      {
      case 42:                      // '-'
        shiftT(42);                 // '-'
        break;
      default:
        shiftT(40);                 // '+'
      }
    }
    try_ValueExpr();
  }

  function parse_ValueExpr()
  {
    eventHandler.startNonterminal("ValueExpr", e0);
    switch (l1)
    {
    case 260:                       // 'validate'
      lookahead2W(246);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 87812:                     // 'validate' 'lax'
    case 123140:                    // 'validate' 'strict'
    case 129284:                    // 'validate' 'type'
    case 141572:                    // 'validate' '{'
      parse_ValidateExpr();
      break;
    case 35:                        // '(#'
      parse_ExtensionExpr();
      break;
    default:
      parse_SimpleMapExpr();
    }
    eventHandler.endNonterminal("ValueExpr", e0);
  }

  function try_ValueExpr()
  {
    switch (l1)
    {
    case 260:                       // 'validate'
      lookahead2W(246);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 87812:                     // 'validate' 'lax'
    case 123140:                    // 'validate' 'strict'
    case 129284:                    // 'validate' 'type'
    case 141572:                    // 'validate' '{'
      try_ValidateExpr();
      break;
    case 35:                        // '(#'
      try_ExtensionExpr();
      break;
    default:
      try_SimpleMapExpr();
    }
  }

  function parse_SimpleMapExpr()
  {
    eventHandler.startNonterminal("SimpleMapExpr", e0);
    parse_PathExpr();
    for (;;)
    {
      if (l1 != 26)                 // '!'
      {
        break;
      }
      shift(26);                    // '!'
      lookahead1W(264);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_PathExpr();
    }
    eventHandler.endNonterminal("SimpleMapExpr", e0);
  }

  function try_SimpleMapExpr()
  {
    try_PathExpr();
    for (;;)
    {
      if (l1 != 26)                 // '!'
      {
        break;
      }
      shiftT(26);                   // '!'
      lookahead1W(264);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_PathExpr();
    }
  }

  function parse_GeneralComp()
  {
    eventHandler.startNonterminal("GeneralComp", e0);
    switch (l1)
    {
    case 60:                        // '='
      shift(60);                    // '='
      break;
    case 27:                        // '!='
      shift(27);                    // '!='
      break;
    case 54:                        // '<'
      shift(54);                    // '<'
      break;
    case 58:                        // '<='
      shift(58);                    // '<='
      break;
    case 61:                        // '>'
      shift(61);                    // '>'
      break;
    default:
      shift(62);                    // '>='
    }
    eventHandler.endNonterminal("GeneralComp", e0);
  }

  function try_GeneralComp()
  {
    switch (l1)
    {
    case 60:                        // '='
      shiftT(60);                   // '='
      break;
    case 27:                        // '!='
      shiftT(27);                   // '!='
      break;
    case 54:                        // '<'
      shiftT(54);                   // '<'
      break;
    case 58:                        // '<='
      shiftT(58);                   // '<='
      break;
    case 61:                        // '>'
      shiftT(61);                   // '>'
      break;
    default:
      shiftT(62);                   // '>='
    }
  }

  function parse_ValueComp()
  {
    eventHandler.startNonterminal("ValueComp", e0);
    switch (l1)
    {
    case 128:                       // 'eq'
      shift(128);                   // 'eq'
      break;
    case 186:                       // 'ne'
      shift(186);                   // 'ne'
      break;
    case 178:                       // 'lt'
      shift(178);                   // 'lt'
      break;
    case 172:                       // 'le'
      shift(172);                   // 'le'
      break;
    case 150:                       // 'gt'
      shift(150);                   // 'gt'
      break;
    default:
      shift(146);                   // 'ge'
    }
    eventHandler.endNonterminal("ValueComp", e0);
  }

  function try_ValueComp()
  {
    switch (l1)
    {
    case 128:                       // 'eq'
      shiftT(128);                  // 'eq'
      break;
    case 186:                       // 'ne'
      shiftT(186);                  // 'ne'
      break;
    case 178:                       // 'lt'
      shiftT(178);                  // 'lt'
      break;
    case 172:                       // 'le'
      shiftT(172);                  // 'le'
      break;
    case 150:                       // 'gt'
      shiftT(150);                  // 'gt'
      break;
    default:
      shiftT(146);                  // 'ge'
    }
  }

  function parse_NodeComp()
  {
    eventHandler.startNonterminal("NodeComp", e0);
    switch (l1)
    {
    case 164:                       // 'is'
      shift(164);                   // 'is'
      break;
    case 57:                        // '<<'
      shift(57);                    // '<<'
      break;
    default:
      shift(63);                    // '>>'
    }
    eventHandler.endNonterminal("NodeComp", e0);
  }

  function try_NodeComp()
  {
    switch (l1)
    {
    case 164:                       // 'is'
      shiftT(164);                  // 'is'
      break;
    case 57:                        // '<<'
      shiftT(57);                   // '<<'
      break;
    default:
      shiftT(63);                   // '>>'
    }
  }

  function parse_ValidateExpr()
  {
    eventHandler.startNonterminal("ValidateExpr", e0);
    shift(260);                     // 'validate'
    lookahead1W(160);               // S^WS | '(:' | 'lax' | 'strict' | 'type' | '{'
    if (l1 != 276)                  // '{'
    {
      switch (l1)
      {
      case 252:                     // 'type'
        shift(252);                 // 'type'
        lookahead1W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        whitespace();
        parse_TypeName();
        break;
      default:
        whitespace();
        parse_ValidationMode();
      }
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("ValidateExpr", e0);
  }

  function try_ValidateExpr()
  {
    shiftT(260);                    // 'validate'
    lookahead1W(160);               // S^WS | '(:' | 'lax' | 'strict' | 'type' | '{'
    if (l1 != 276)                  // '{'
    {
      switch (l1)
      {
      case 252:                     // 'type'
        shiftT(252);                // 'type'
        lookahead1W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        try_TypeName();
        break;
      default:
        try_ValidationMode();
      }
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(282);                    // '}'
  }

  function parse_ValidationMode()
  {
    eventHandler.startNonterminal("ValidationMode", e0);
    switch (l1)
    {
    case 171:                       // 'lax'
      shift(171);                   // 'lax'
      break;
    default:
      shift(240);                   // 'strict'
    }
    eventHandler.endNonterminal("ValidationMode", e0);
  }

  function try_ValidationMode()
  {
    switch (l1)
    {
    case 171:                       // 'lax'
      shiftT(171);                  // 'lax'
      break;
    default:
      shiftT(240);                  // 'strict'
    }
  }

  function parse_ExtensionExpr()
  {
    eventHandler.startNonterminal("ExtensionExpr", e0);
    for (;;)
    {
      whitespace();
      parse_Pragma();
      lookahead1W(100);             // S^WS | '(#' | '(:' | '{'
      if (l1 != 35)                 // '(#'
      {
        break;
      }
    }
    shift(276);                     // '{'
    lookahead1W(272);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 282)                  // '}'
    {
      whitespace();
      parse_Expr();
    }
    shift(282);                     // '}'
    eventHandler.endNonterminal("ExtensionExpr", e0);
  }

  function try_ExtensionExpr()
  {
    for (;;)
    {
      try_Pragma();
      lookahead1W(100);             // S^WS | '(#' | '(:' | '{'
      if (l1 != 35)                 // '(#'
      {
        break;
      }
    }
    shiftT(276);                    // '{'
    lookahead1W(272);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 282)                  // '}'
    {
      try_Expr();
    }
    shiftT(282);                    // '}'
  }

  function parse_Pragma()
  {
    eventHandler.startNonterminal("Pragma", e0);
    shift(35);                      // '(#'
    lookahead1(248);                // EQName^Token | S | 'after' | 'allowing' | 'ancestor' | 'ancestor-or-self' |
    if (l1 == 21)                   // S
    {
      shift(21);                    // S
    }
    parse_EQName();
    lookahead1(10);                 // S | '#)'
    if (l1 == 21)                   // S
    {
      shift(21);                    // S
      lookahead1(0);                // PragmaContents
      shift(1);                     // PragmaContents
    }
    lookahead1(5);                  // '#)'
    shift(30);                      // '#)'
    eventHandler.endNonterminal("Pragma", e0);
  }

  function try_Pragma()
  {
    shiftT(35);                     // '(#'
    lookahead1(248);                // EQName^Token | S | 'after' | 'allowing' | 'ancestor' | 'ancestor-or-self' |
    if (l1 == 21)                   // S
    {
      shiftT(21);                   // S
    }
    try_EQName();
    lookahead1(10);                 // S | '#)'
    if (l1 == 21)                   // S
    {
      shiftT(21);                   // S
      lookahead1(0);                // PragmaContents
      shiftT(1);                    // PragmaContents
    }
    lookahead1(5);                  // '#)'
    shiftT(30);                     // '#)'
  }

  function parse_PathExpr()
  {
    eventHandler.startNonterminal("PathExpr", e0);
    switch (l1)
    {
    case 46:                        // '/'
      shift(46);                    // '/'
      lookahead1W(283);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      switch (l1)
      {
      case 25:                      // EOF
      case 26:                      // '!'
      case 27:                      // '!='
      case 37:                      // ')'
      case 38:                      // '*'
      case 40:                      // '+'
      case 41:                      // ','
      case 42:                      // '-'
      case 49:                      // ':'
      case 53:                      // ';'
      case 57:                      // '<<'
      case 58:                      // '<='
      case 60:                      // '='
      case 61:                      // '>'
      case 62:                      // '>='
      case 63:                      // '>>'
      case 69:                      // ']'
      case 87:                      // 'by'
      case 99:                      // 'contains'
      case 205:                     // 'paragraphs'
      case 232:                     // 'sentences'
      case 247:                     // 'times'
      case 273:                     // 'words'
      case 279:                     // '|'
      case 280:                     // '||'
      case 281:                     // '|}'
      case 282:                     // '}'
        break;
      default:
        whitespace();
        parse_RelativePathExpr();
      }
      break;
    case 47:                        // '//'
      shift(47);                    // '//'
      lookahead1W(263);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_RelativePathExpr();
      break;
    default:
      parse_RelativePathExpr();
    }
    eventHandler.endNonterminal("PathExpr", e0);
  }

  function try_PathExpr()
  {
    switch (l1)
    {
    case 46:                        // '/'
      shiftT(46);                   // '/'
      lookahead1W(283);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      switch (l1)
      {
      case 25:                      // EOF
      case 26:                      // '!'
      case 27:                      // '!='
      case 37:                      // ')'
      case 38:                      // '*'
      case 40:                      // '+'
      case 41:                      // ','
      case 42:                      // '-'
      case 49:                      // ':'
      case 53:                      // ';'
      case 57:                      // '<<'
      case 58:                      // '<='
      case 60:                      // '='
      case 61:                      // '>'
      case 62:                      // '>='
      case 63:                      // '>>'
      case 69:                      // ']'
      case 87:                      // 'by'
      case 99:                      // 'contains'
      case 205:                     // 'paragraphs'
      case 232:                     // 'sentences'
      case 247:                     // 'times'
      case 273:                     // 'words'
      case 279:                     // '|'
      case 280:                     // '||'
      case 281:                     // '|}'
      case 282:                     // '}'
        break;
      default:
        try_RelativePathExpr();
      }
      break;
    case 47:                        // '//'
      shiftT(47);                   // '//'
      lookahead1W(263);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_RelativePathExpr();
      break;
    default:
      try_RelativePathExpr();
    }
  }

  function parse_RelativePathExpr()
  {
    eventHandler.startNonterminal("RelativePathExpr", e0);
    parse_StepExpr();
    for (;;)
    {
      switch (l1)
      {
      case 26:                      // '!'
        lookahead2W(264);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      default:
        lk = l1;
      }
      if (lk != 25                  // EOF
       && lk != 27                  // '!='
       && lk != 37                  // ')'
       && lk != 38                  // '*'
       && lk != 40                  // '+'
       && lk != 41                  // ','
       && lk != 42                  // '-'
       && lk != 46                  // '/'
       && lk != 47                  // '//'
       && lk != 49                  // ':'
       && lk != 53                  // ';'
       && lk != 54                  // '<'
       && lk != 57                  // '<<'
       && lk != 58                  // '<='
       && lk != 60                  // '='
       && lk != 61                  // '>'
       && lk != 62                  // '>='
       && lk != 63                  // '>>'
       && lk != 69                  // ']'
       && lk != 70                  // 'after'
       && lk != 75                  // 'and'
       && lk != 79                  // 'as'
       && lk != 80                  // 'ascending'
       && lk != 81                  // 'at'
       && lk != 84                  // 'before'
       && lk != 87                  // 'by'
       && lk != 88                  // 'case'
       && lk != 89                  // 'cast'
       && lk != 90                  // 'castable'
       && lk != 94                  // 'collation'
       && lk != 99                  // 'contains'
       && lk != 105                 // 'count'
       && lk != 109                 // 'default'
       && lk != 113                 // 'descending'
       && lk != 118                 // 'div'
       && lk != 122                 // 'else'
       && lk != 123                 // 'empty'
       && lk != 126                 // 'end'
       && lk != 128                 // 'eq'
       && lk != 131                 // 'except'
       && lk != 137                 // 'for'
       && lk != 146                 // 'ge'
       && lk != 148                 // 'group'
       && lk != 150                 // 'gt'
       && lk != 151                 // 'idiv'
       && lk != 160                 // 'instance'
       && lk != 162                 // 'intersect'
       && lk != 163                 // 'into'
       && lk != 164                 // 'is'
       && lk != 172                 // 'le'
       && lk != 174                 // 'let'
       && lk != 178                 // 'lt'
       && lk != 180                 // 'mod'
       && lk != 181                 // 'modify'
       && lk != 186                 // 'ne'
       && lk != 198                 // 'only'
       && lk != 200                 // 'or'
       && lk != 201                 // 'order'
       && lk != 205                 // 'paragraphs'
       && lk != 220                 // 'return'
       && lk != 224                 // 'satisfies'
       && lk != 232                 // 'sentences'
       && lk != 236                 // 'stable'
       && lk != 237                 // 'start'
       && lk != 247                 // 'times'
       && lk != 248                 // 'to'
       && lk != 249                 // 'treat'
       && lk != 254                 // 'union'
       && lk != 266                 // 'where'
       && lk != 270                 // 'with'
       && lk != 273                 // 'words'
       && lk != 279                 // '|'
       && lk != 280                 // '||'
       && lk != 281                 // '|}'
       && lk != 282                 // '}'
       && lk != 23578               // '!' '/'
       && lk != 24090)              // '!' '//'
      {
        lk = memoized(2, e0);
        if (lk == 0)
        {
          var b0A = b0; var e0A = e0; var l1A = l1;
          var b1A = b1; var e1A = e1; var l2A = l2;
          var b2A = b2; var e2A = e2;
          try
          {
            switch (l1)
            {
            case 46:                // '/'
              shiftT(46);           // '/'
              break;
            case 47:                // '//'
              shiftT(47);           // '//'
              break;
            default:
              shiftT(26);           // '!'
            }
            lookahead1W(263);       // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
            try_StepExpr();
            lk = -1;
          }
          catch (p1A)
          {
            lk = -2;
          }
          b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
          b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
          b2 = b2A; e2 = e2A; end = e2A; }}
          memoize(2, e0, lk);
        }
      }
      if (lk != -1
       && lk != 46                  // '/'
       && lk != 47)                 // '//'
      {
        break;
      }
      switch (l1)
      {
      case 46:                      // '/'
        shift(46);                  // '/'
        break;
      case 47:                      // '//'
        shift(47);                  // '//'
        break;
      default:
        shift(26);                  // '!'
      }
      lookahead1W(263);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_StepExpr();
    }
    eventHandler.endNonterminal("RelativePathExpr", e0);
  }

  function try_RelativePathExpr()
  {
    try_StepExpr();
    for (;;)
    {
      switch (l1)
      {
      case 26:                      // '!'
        lookahead2W(264);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      default:
        lk = l1;
      }
      if (lk != 25                  // EOF
       && lk != 27                  // '!='
       && lk != 37                  // ')'
       && lk != 38                  // '*'
       && lk != 40                  // '+'
       && lk != 41                  // ','
       && lk != 42                  // '-'
       && lk != 46                  // '/'
       && lk != 47                  // '//'
       && lk != 49                  // ':'
       && lk != 53                  // ';'
       && lk != 54                  // '<'
       && lk != 57                  // '<<'
       && lk != 58                  // '<='
       && lk != 60                  // '='
       && lk != 61                  // '>'
       && lk != 62                  // '>='
       && lk != 63                  // '>>'
       && lk != 69                  // ']'
       && lk != 70                  // 'after'
       && lk != 75                  // 'and'
       && lk != 79                  // 'as'
       && lk != 80                  // 'ascending'
       && lk != 81                  // 'at'
       && lk != 84                  // 'before'
       && lk != 87                  // 'by'
       && lk != 88                  // 'case'
       && lk != 89                  // 'cast'
       && lk != 90                  // 'castable'
       && lk != 94                  // 'collation'
       && lk != 99                  // 'contains'
       && lk != 105                 // 'count'
       && lk != 109                 // 'default'
       && lk != 113                 // 'descending'
       && lk != 118                 // 'div'
       && lk != 122                 // 'else'
       && lk != 123                 // 'empty'
       && lk != 126                 // 'end'
       && lk != 128                 // 'eq'
       && lk != 131                 // 'except'
       && lk != 137                 // 'for'
       && lk != 146                 // 'ge'
       && lk != 148                 // 'group'
       && lk != 150                 // 'gt'
       && lk != 151                 // 'idiv'
       && lk != 160                 // 'instance'
       && lk != 162                 // 'intersect'
       && lk != 163                 // 'into'
       && lk != 164                 // 'is'
       && lk != 172                 // 'le'
       && lk != 174                 // 'let'
       && lk != 178                 // 'lt'
       && lk != 180                 // 'mod'
       && lk != 181                 // 'modify'
       && lk != 186                 // 'ne'
       && lk != 198                 // 'only'
       && lk != 200                 // 'or'
       && lk != 201                 // 'order'
       && lk != 205                 // 'paragraphs'
       && lk != 220                 // 'return'
       && lk != 224                 // 'satisfies'
       && lk != 232                 // 'sentences'
       && lk != 236                 // 'stable'
       && lk != 237                 // 'start'
       && lk != 247                 // 'times'
       && lk != 248                 // 'to'
       && lk != 249                 // 'treat'
       && lk != 254                 // 'union'
       && lk != 266                 // 'where'
       && lk != 270                 // 'with'
       && lk != 273                 // 'words'
       && lk != 279                 // '|'
       && lk != 280                 // '||'
       && lk != 281                 // '|}'
       && lk != 282                 // '}'
       && lk != 23578               // '!' '/'
       && lk != 24090)              // '!' '//'
      {
        lk = memoized(2, e0);
        if (lk == 0)
        {
          var b0A = b0; var e0A = e0; var l1A = l1;
          var b1A = b1; var e1A = e1; var l2A = l2;
          var b2A = b2; var e2A = e2;
          try
          {
            switch (l1)
            {
            case 46:                // '/'
              shiftT(46);           // '/'
              break;
            case 47:                // '//'
              shiftT(47);           // '//'
              break;
            default:
              shiftT(26);           // '!'
            }
            lookahead1W(263);       // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
            try_StepExpr();
            lk = -1;
          }
          catch (p1A)
          {
            lk = -2;
          }
          b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
          b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
          b2 = b2A; e2 = e2A; end = e2A; }}
          memoize(2, e0, lk);
        }
      }
      if (lk != -1
       && lk != 46                  // '/'
       && lk != 47)                 // '//'
      {
        break;
      }
      switch (l1)
      {
      case 46:                      // '/'
        shiftT(46);                 // '/'
        break;
      case 47:                      // '//'
        shiftT(47);                 // '//'
        break;
      default:
        shiftT(26);                 // '!'
      }
      lookahead1W(263);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_StepExpr();
    }
  }

  function parse_StepExpr()
  {
    eventHandler.startNonterminal("StepExpr", e0);
    switch (l1)
    {
    case 82:                        // 'attribute'
      lookahead2W(282);             // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' |
      break;
    case 121:                       // 'element'
      lookahead2W(279);             // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' |
      break;
    case 184:                       // 'namespace'
    case 216:                       // 'processing-instruction'
      lookahead2W(280);             // NCName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' |
      break;
    case 96:                        // 'comment'
    case 119:                       // 'document'
    case 202:                       // 'ordered'
    case 244:                       // 'text'
    case 256:                       // 'unordered'
      lookahead2W(245);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    case 124:                       // 'empty-sequence'
    case 152:                       // 'if'
    case 165:                       // 'item'
    case 243:                       // 'switch'
    case 253:                       // 'typeswitch'
      lookahead2W(238);             // S^WS | EOF | '!' | '!=' | '#' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    case 73:                        // 'ancestor'
    case 74:                        // 'ancestor-or-self'
    case 93:                        // 'child'
    case 111:                       // 'descendant'
    case 112:                       // 'descendant-or-self'
    case 135:                       // 'following'
    case 136:                       // 'following-sibling'
    case 206:                       // 'parent'
    case 212:                       // 'preceding'
    case 213:                       // 'preceding-sibling'
    case 229:                       // 'self'
      lookahead2W(244);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    case 6:                         // EQName^Token
    case 70:                        // 'after'
    case 72:                        // 'allowing'
    case 75:                        // 'and'
    case 79:                        // 'as'
    case 80:                        // 'ascending'
    case 81:                        // 'at'
    case 83:                        // 'base-uri'
    case 84:                        // 'before'
    case 85:                        // 'boundary-space'
    case 86:                        // 'break'
    case 88:                        // 'case'
    case 89:                        // 'cast'
    case 90:                        // 'castable'
    case 91:                        // 'catch'
    case 94:                        // 'collation'
    case 97:                        // 'constraint'
    case 98:                        // 'construction'
    case 101:                       // 'context'
    case 102:                       // 'continue'
    case 103:                       // 'copy'
    case 104:                       // 'copy-namespaces'
    case 105:                       // 'count'
    case 106:                       // 'decimal-format'
    case 108:                       // 'declare'
    case 109:                       // 'default'
    case 110:                       // 'delete'
    case 113:                       // 'descending'
    case 118:                       // 'div'
    case 120:                       // 'document-node'
    case 122:                       // 'else'
    case 123:                       // 'empty'
    case 125:                       // 'encoding'
    case 126:                       // 'end'
    case 128:                       // 'eq'
    case 129:                       // 'every'
    case 131:                       // 'except'
    case 132:                       // 'exit'
    case 133:                       // 'external'
    case 134:                       // 'first'
    case 137:                       // 'for'
    case 141:                       // 'ft-option'
    case 145:                       // 'function'
    case 146:                       // 'ge'
    case 148:                       // 'group'
    case 150:                       // 'gt'
    case 151:                       // 'idiv'
    case 153:                       // 'import'
    case 154:                       // 'in'
    case 155:                       // 'index'
    case 159:                       // 'insert'
    case 160:                       // 'instance'
    case 161:                       // 'integrity'
    case 162:                       // 'intersect'
    case 163:                       // 'into'
    case 164:                       // 'is'
    case 170:                       // 'last'
    case 171:                       // 'lax'
    case 172:                       // 'le'
    case 174:                       // 'let'
    case 176:                       // 'loop'
    case 178:                       // 'lt'
    case 180:                       // 'mod'
    case 181:                       // 'modify'
    case 182:                       // 'module'
    case 185:                       // 'namespace-node'
    case 186:                       // 'ne'
    case 191:                       // 'node'
    case 192:                       // 'nodes'
    case 198:                       // 'only'
    case 199:                       // 'option'
    case 200:                       // 'or'
    case 201:                       // 'order'
    case 203:                       // 'ordering'
    case 218:                       // 'rename'
    case 219:                       // 'replace'
    case 220:                       // 'return'
    case 221:                       // 'returning'
    case 222:                       // 'revalidation'
    case 224:                       // 'satisfies'
    case 225:                       // 'schema'
    case 226:                       // 'schema-attribute'
    case 227:                       // 'schema-element'
    case 228:                       // 'score'
    case 234:                       // 'sliding'
    case 235:                       // 'some'
    case 236:                       // 'stable'
    case 237:                       // 'start'
    case 240:                       // 'strict'
    case 248:                       // 'to'
    case 249:                       // 'treat'
    case 250:                       // 'try'
    case 251:                       // 'tumbling'
    case 252:                       // 'type'
    case 254:                       // 'union'
    case 257:                       // 'updating'
    case 260:                       // 'validate'
    case 261:                       // 'value'
    case 262:                       // 'variable'
    case 263:                       // 'version'
    case 266:                       // 'where'
    case 267:                       // 'while'
    case 270:                       // 'with'
    case 274:                       // 'xquery'
      lookahead2W(242);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    default:
      lk = l1;
    }
    if (lk == 35922                 // 'attribute' 'after'
     || lk == 35961                 // 'element' 'after'
     || lk == 36024                 // 'namespace' 'after'
     || lk == 36056                 // 'processing-instruction' 'after'
     || lk == 38482                 // 'attribute' 'and'
     || lk == 38521                 // 'element' 'and'
     || lk == 38584                 // 'namespace' 'and'
     || lk == 38616                 // 'processing-instruction' 'and'
     || lk == 40530                 // 'attribute' 'as'
     || lk == 40569                 // 'element' 'as'
     || lk == 40632                 // 'namespace' 'as'
     || lk == 40664                 // 'processing-instruction' 'as'
     || lk == 41042                 // 'attribute' 'ascending'
     || lk == 41081                 // 'element' 'ascending'
     || lk == 41144                 // 'namespace' 'ascending'
     || lk == 41176                 // 'processing-instruction' 'ascending'
     || lk == 41554                 // 'attribute' 'at'
     || lk == 41593                 // 'element' 'at'
     || lk == 41656                 // 'namespace' 'at'
     || lk == 41688                 // 'processing-instruction' 'at'
     || lk == 43090                 // 'attribute' 'before'
     || lk == 43129                 // 'element' 'before'
     || lk == 43192                 // 'namespace' 'before'
     || lk == 43224                 // 'processing-instruction' 'before'
     || lk == 45138                 // 'attribute' 'case'
     || lk == 45177                 // 'element' 'case'
     || lk == 45240                 // 'namespace' 'case'
     || lk == 45272                 // 'processing-instruction' 'case'
     || lk == 45650                 // 'attribute' 'cast'
     || lk == 45689                 // 'element' 'cast'
     || lk == 45752                 // 'namespace' 'cast'
     || lk == 45784                 // 'processing-instruction' 'cast'
     || lk == 46162                 // 'attribute' 'castable'
     || lk == 46201                 // 'element' 'castable'
     || lk == 46264                 // 'namespace' 'castable'
     || lk == 46296                 // 'processing-instruction' 'castable'
     || lk == 48210                 // 'attribute' 'collation'
     || lk == 48249                 // 'element' 'collation'
     || lk == 48312                 // 'namespace' 'collation'
     || lk == 48344                 // 'processing-instruction' 'collation'
     || lk == 53842                 // 'attribute' 'count'
     || lk == 53881                 // 'element' 'count'
     || lk == 53944                 // 'namespace' 'count'
     || lk == 53976                 // 'processing-instruction' 'count'
     || lk == 55890                 // 'attribute' 'default'
     || lk == 55929                 // 'element' 'default'
     || lk == 55992                 // 'namespace' 'default'
     || lk == 56024                 // 'processing-instruction' 'default'
     || lk == 57938                 // 'attribute' 'descending'
     || lk == 57977                 // 'element' 'descending'
     || lk == 58040                 // 'namespace' 'descending'
     || lk == 58072                 // 'processing-instruction' 'descending'
     || lk == 60498                 // 'attribute' 'div'
     || lk == 60537                 // 'element' 'div'
     || lk == 60600                 // 'namespace' 'div'
     || lk == 60632                 // 'processing-instruction' 'div'
     || lk == 62546                 // 'attribute' 'else'
     || lk == 62585                 // 'element' 'else'
     || lk == 62648                 // 'namespace' 'else'
     || lk == 62680                 // 'processing-instruction' 'else'
     || lk == 63058                 // 'attribute' 'empty'
     || lk == 63097                 // 'element' 'empty'
     || lk == 63160                 // 'namespace' 'empty'
     || lk == 63192                 // 'processing-instruction' 'empty'
     || lk == 64594                 // 'attribute' 'end'
     || lk == 64633                 // 'element' 'end'
     || lk == 64696                 // 'namespace' 'end'
     || lk == 64728                 // 'processing-instruction' 'end'
     || lk == 65618                 // 'attribute' 'eq'
     || lk == 65657                 // 'element' 'eq'
     || lk == 65720                 // 'namespace' 'eq'
     || lk == 65752                 // 'processing-instruction' 'eq'
     || lk == 67154                 // 'attribute' 'except'
     || lk == 67193                 // 'element' 'except'
     || lk == 67256                 // 'namespace' 'except'
     || lk == 67288                 // 'processing-instruction' 'except'
     || lk == 70226                 // 'attribute' 'for'
     || lk == 70265                 // 'element' 'for'
     || lk == 70328                 // 'namespace' 'for'
     || lk == 70360                 // 'processing-instruction' 'for'
     || lk == 74834                 // 'attribute' 'ge'
     || lk == 74873                 // 'element' 'ge'
     || lk == 74936                 // 'namespace' 'ge'
     || lk == 74968                 // 'processing-instruction' 'ge'
     || lk == 75858                 // 'attribute' 'group'
     || lk == 75897                 // 'element' 'group'
     || lk == 75960                 // 'namespace' 'group'
     || lk == 75992                 // 'processing-instruction' 'group'
     || lk == 76882                 // 'attribute' 'gt'
     || lk == 76921                 // 'element' 'gt'
     || lk == 76984                 // 'namespace' 'gt'
     || lk == 77016                 // 'processing-instruction' 'gt'
     || lk == 77394                 // 'attribute' 'idiv'
     || lk == 77433                 // 'element' 'idiv'
     || lk == 77496                 // 'namespace' 'idiv'
     || lk == 77528                 // 'processing-instruction' 'idiv'
     || lk == 82002                 // 'attribute' 'instance'
     || lk == 82041                 // 'element' 'instance'
     || lk == 82104                 // 'namespace' 'instance'
     || lk == 82136                 // 'processing-instruction' 'instance'
     || lk == 83026                 // 'attribute' 'intersect'
     || lk == 83065                 // 'element' 'intersect'
     || lk == 83128                 // 'namespace' 'intersect'
     || lk == 83160                 // 'processing-instruction' 'intersect'
     || lk == 83538                 // 'attribute' 'into'
     || lk == 83577                 // 'element' 'into'
     || lk == 83640                 // 'namespace' 'into'
     || lk == 83672                 // 'processing-instruction' 'into'
     || lk == 84050                 // 'attribute' 'is'
     || lk == 84089                 // 'element' 'is'
     || lk == 84152                 // 'namespace' 'is'
     || lk == 84184                 // 'processing-instruction' 'is'
     || lk == 88146                 // 'attribute' 'le'
     || lk == 88185                 // 'element' 'le'
     || lk == 88248                 // 'namespace' 'le'
     || lk == 88280                 // 'processing-instruction' 'le'
     || lk == 89170                 // 'attribute' 'let'
     || lk == 89209                 // 'element' 'let'
     || lk == 89272                 // 'namespace' 'let'
     || lk == 89304                 // 'processing-instruction' 'let'
     || lk == 91218                 // 'attribute' 'lt'
     || lk == 91257                 // 'element' 'lt'
     || lk == 91320                 // 'namespace' 'lt'
     || lk == 91352                 // 'processing-instruction' 'lt'
     || lk == 92242                 // 'attribute' 'mod'
     || lk == 92281                 // 'element' 'mod'
     || lk == 92344                 // 'namespace' 'mod'
     || lk == 92376                 // 'processing-instruction' 'mod'
     || lk == 92754                 // 'attribute' 'modify'
     || lk == 92793                 // 'element' 'modify'
     || lk == 92856                 // 'namespace' 'modify'
     || lk == 92888                 // 'processing-instruction' 'modify'
     || lk == 95314                 // 'attribute' 'ne'
     || lk == 95353                 // 'element' 'ne'
     || lk == 95416                 // 'namespace' 'ne'
     || lk == 95448                 // 'processing-instruction' 'ne'
     || lk == 101458                // 'attribute' 'only'
     || lk == 101497                // 'element' 'only'
     || lk == 101560                // 'namespace' 'only'
     || lk == 101592                // 'processing-instruction' 'only'
     || lk == 102482                // 'attribute' 'or'
     || lk == 102521                // 'element' 'or'
     || lk == 102584                // 'namespace' 'or'
     || lk == 102616                // 'processing-instruction' 'or'
     || lk == 102994                // 'attribute' 'order'
     || lk == 103033                // 'element' 'order'
     || lk == 103096                // 'namespace' 'order'
     || lk == 103128                // 'processing-instruction' 'order'
     || lk == 112722                // 'attribute' 'return'
     || lk == 112761                // 'element' 'return'
     || lk == 112824                // 'namespace' 'return'
     || lk == 112856                // 'processing-instruction' 'return'
     || lk == 114770                // 'attribute' 'satisfies'
     || lk == 114809                // 'element' 'satisfies'
     || lk == 114872                // 'namespace' 'satisfies'
     || lk == 114904                // 'processing-instruction' 'satisfies'
     || lk == 120914                // 'attribute' 'stable'
     || lk == 120953                // 'element' 'stable'
     || lk == 121016                // 'namespace' 'stable'
     || lk == 121048                // 'processing-instruction' 'stable'
     || lk == 121426                // 'attribute' 'start'
     || lk == 121465                // 'element' 'start'
     || lk == 121528                // 'namespace' 'start'
     || lk == 121560                // 'processing-instruction' 'start'
     || lk == 127058                // 'attribute' 'to'
     || lk == 127097                // 'element' 'to'
     || lk == 127160                // 'namespace' 'to'
     || lk == 127192                // 'processing-instruction' 'to'
     || lk == 127570                // 'attribute' 'treat'
     || lk == 127609                // 'element' 'treat'
     || lk == 127672                // 'namespace' 'treat'
     || lk == 127704                // 'processing-instruction' 'treat'
     || lk == 130130                // 'attribute' 'union'
     || lk == 130169                // 'element' 'union'
     || lk == 130232                // 'namespace' 'union'
     || lk == 130264                // 'processing-instruction' 'union'
     || lk == 136274                // 'attribute' 'where'
     || lk == 136313                // 'element' 'where'
     || lk == 136376                // 'namespace' 'where'
     || lk == 136408                // 'processing-instruction' 'where'
     || lk == 138322                // 'attribute' 'with'
     || lk == 138361                // 'element' 'with'
     || lk == 138424                // 'namespace' 'with'
     || lk == 138456)               // 'processing-instruction' 'with'
    {
      lk = memoized(3, e0);
      if (lk == 0)
      {
        var b0A = b0; var e0A = e0; var l1A = l1;
        var b1A = b1; var e1A = e1; var l2A = l2;
        var b2A = b2; var e2A = e2;
        try
        {
          try_PostfixExpr();
          lk = -1;
        }
        catch (p1A)
        {
          lk = -2;
        }
        b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
        b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
        b2 = b2A; e2 = e2A; end = e2A; }}
        memoize(3, e0, lk);
      }
    }
    switch (lk)
    {
    case -1:
    case 8:                         // IntegerLiteral
    case 9:                         // DecimalLiteral
    case 10:                        // DoubleLiteral
    case 11:                        // StringLiteral
    case 31:                        // '$'
    case 32:                        // '%'
    case 34:                        // '('
    case 44:                        // '.'
    case 54:                        // '<'
    case 55:                        // '<!--'
    case 59:                        // '<?'
    case 68:                        // '['
    case 276:                       // '{'
    case 278:                       // '{|'
    case 3154:                      // 'attribute' EQName^Token
    case 3193:                      // 'element' EQName^Token
    case 9912:                      // 'namespace' NCName^Token
    case 9944:                      // 'processing-instruction' NCName^Token
    case 14854:                     // EQName^Token '#'
    case 14918:                     // 'after' '#'
    case 14920:                     // 'allowing' '#'
    case 14921:                     // 'ancestor' '#'
    case 14922:                     // 'ancestor-or-self' '#'
    case 14923:                     // 'and' '#'
    case 14927:                     // 'as' '#'
    case 14928:                     // 'ascending' '#'
    case 14929:                     // 'at' '#'
    case 14930:                     // 'attribute' '#'
    case 14931:                     // 'base-uri' '#'
    case 14932:                     // 'before' '#'
    case 14933:                     // 'boundary-space' '#'
    case 14934:                     // 'break' '#'
    case 14936:                     // 'case' '#'
    case 14937:                     // 'cast' '#'
    case 14938:                     // 'castable' '#'
    case 14939:                     // 'catch' '#'
    case 14941:                     // 'child' '#'
    case 14942:                     // 'collation' '#'
    case 14944:                     // 'comment' '#'
    case 14945:                     // 'constraint' '#'
    case 14946:                     // 'construction' '#'
    case 14949:                     // 'context' '#'
    case 14950:                     // 'continue' '#'
    case 14951:                     // 'copy' '#'
    case 14952:                     // 'copy-namespaces' '#'
    case 14953:                     // 'count' '#'
    case 14954:                     // 'decimal-format' '#'
    case 14956:                     // 'declare' '#'
    case 14957:                     // 'default' '#'
    case 14958:                     // 'delete' '#'
    case 14959:                     // 'descendant' '#'
    case 14960:                     // 'descendant-or-self' '#'
    case 14961:                     // 'descending' '#'
    case 14966:                     // 'div' '#'
    case 14967:                     // 'document' '#'
    case 14968:                     // 'document-node' '#'
    case 14969:                     // 'element' '#'
    case 14970:                     // 'else' '#'
    case 14971:                     // 'empty' '#'
    case 14972:                     // 'empty-sequence' '#'
    case 14973:                     // 'encoding' '#'
    case 14974:                     // 'end' '#'
    case 14976:                     // 'eq' '#'
    case 14977:                     // 'every' '#'
    case 14979:                     // 'except' '#'
    case 14980:                     // 'exit' '#'
    case 14981:                     // 'external' '#'
    case 14982:                     // 'first' '#'
    case 14983:                     // 'following' '#'
    case 14984:                     // 'following-sibling' '#'
    case 14985:                     // 'for' '#'
    case 14989:                     // 'ft-option' '#'
    case 14993:                     // 'function' '#'
    case 14994:                     // 'ge' '#'
    case 14996:                     // 'group' '#'
    case 14998:                     // 'gt' '#'
    case 14999:                     // 'idiv' '#'
    case 15000:                     // 'if' '#'
    case 15001:                     // 'import' '#'
    case 15002:                     // 'in' '#'
    case 15003:                     // 'index' '#'
    case 15007:                     // 'insert' '#'
    case 15008:                     // 'instance' '#'
    case 15009:                     // 'integrity' '#'
    case 15010:                     // 'intersect' '#'
    case 15011:                     // 'into' '#'
    case 15012:                     // 'is' '#'
    case 15013:                     // 'item' '#'
    case 15018:                     // 'last' '#'
    case 15019:                     // 'lax' '#'
    case 15020:                     // 'le' '#'
    case 15022:                     // 'let' '#'
    case 15024:                     // 'loop' '#'
    case 15026:                     // 'lt' '#'
    case 15028:                     // 'mod' '#'
    case 15029:                     // 'modify' '#'
    case 15030:                     // 'module' '#'
    case 15032:                     // 'namespace' '#'
    case 15033:                     // 'namespace-node' '#'
    case 15034:                     // 'ne' '#'
    case 15039:                     // 'node' '#'
    case 15040:                     // 'nodes' '#'
    case 15046:                     // 'only' '#'
    case 15047:                     // 'option' '#'
    case 15048:                     // 'or' '#'
    case 15049:                     // 'order' '#'
    case 15050:                     // 'ordered' '#'
    case 15051:                     // 'ordering' '#'
    case 15054:                     // 'parent' '#'
    case 15060:                     // 'preceding' '#'
    case 15061:                     // 'preceding-sibling' '#'
    case 15064:                     // 'processing-instruction' '#'
    case 15066:                     // 'rename' '#'
    case 15067:                     // 'replace' '#'
    case 15068:                     // 'return' '#'
    case 15069:                     // 'returning' '#'
    case 15070:                     // 'revalidation' '#'
    case 15072:                     // 'satisfies' '#'
    case 15073:                     // 'schema' '#'
    case 15074:                     // 'schema-attribute' '#'
    case 15075:                     // 'schema-element' '#'
    case 15076:                     // 'score' '#'
    case 15077:                     // 'self' '#'
    case 15082:                     // 'sliding' '#'
    case 15083:                     // 'some' '#'
    case 15084:                     // 'stable' '#'
    case 15085:                     // 'start' '#'
    case 15088:                     // 'strict' '#'
    case 15091:                     // 'switch' '#'
    case 15092:                     // 'text' '#'
    case 15096:                     // 'to' '#'
    case 15097:                     // 'treat' '#'
    case 15098:                     // 'try' '#'
    case 15099:                     // 'tumbling' '#'
    case 15100:                     // 'type' '#'
    case 15101:                     // 'typeswitch' '#'
    case 15102:                     // 'union' '#'
    case 15104:                     // 'unordered' '#'
    case 15105:                     // 'updating' '#'
    case 15108:                     // 'validate' '#'
    case 15109:                     // 'value' '#'
    case 15110:                     // 'variable' '#'
    case 15111:                     // 'version' '#'
    case 15114:                     // 'where' '#'
    case 15115:                     // 'while' '#'
    case 15118:                     // 'with' '#'
    case 15122:                     // 'xquery' '#'
    case 17414:                     // EQName^Token '('
    case 17478:                     // 'after' '('
    case 17480:                     // 'allowing' '('
    case 17481:                     // 'ancestor' '('
    case 17482:                     // 'ancestor-or-self' '('
    case 17483:                     // 'and' '('
    case 17487:                     // 'as' '('
    case 17488:                     // 'ascending' '('
    case 17489:                     // 'at' '('
    case 17491:                     // 'base-uri' '('
    case 17492:                     // 'before' '('
    case 17493:                     // 'boundary-space' '('
    case 17494:                     // 'break' '('
    case 17496:                     // 'case' '('
    case 17497:                     // 'cast' '('
    case 17498:                     // 'castable' '('
    case 17499:                     // 'catch' '('
    case 17501:                     // 'child' '('
    case 17502:                     // 'collation' '('
    case 17505:                     // 'constraint' '('
    case 17506:                     // 'construction' '('
    case 17509:                     // 'context' '('
    case 17510:                     // 'continue' '('
    case 17511:                     // 'copy' '('
    case 17512:                     // 'copy-namespaces' '('
    case 17513:                     // 'count' '('
    case 17514:                     // 'decimal-format' '('
    case 17516:                     // 'declare' '('
    case 17517:                     // 'default' '('
    case 17518:                     // 'delete' '('
    case 17519:                     // 'descendant' '('
    case 17520:                     // 'descendant-or-self' '('
    case 17521:                     // 'descending' '('
    case 17526:                     // 'div' '('
    case 17527:                     // 'document' '('
    case 17530:                     // 'else' '('
    case 17531:                     // 'empty' '('
    case 17533:                     // 'encoding' '('
    case 17534:                     // 'end' '('
    case 17536:                     // 'eq' '('
    case 17537:                     // 'every' '('
    case 17539:                     // 'except' '('
    case 17540:                     // 'exit' '('
    case 17541:                     // 'external' '('
    case 17542:                     // 'first' '('
    case 17543:                     // 'following' '('
    case 17544:                     // 'following-sibling' '('
    case 17545:                     // 'for' '('
    case 17549:                     // 'ft-option' '('
    case 17553:                     // 'function' '('
    case 17554:                     // 'ge' '('
    case 17556:                     // 'group' '('
    case 17558:                     // 'gt' '('
    case 17559:                     // 'idiv' '('
    case 17561:                     // 'import' '('
    case 17562:                     // 'in' '('
    case 17563:                     // 'index' '('
    case 17567:                     // 'insert' '('
    case 17568:                     // 'instance' '('
    case 17569:                     // 'integrity' '('
    case 17570:                     // 'intersect' '('
    case 17571:                     // 'into' '('
    case 17572:                     // 'is' '('
    case 17578:                     // 'last' '('
    case 17579:                     // 'lax' '('
    case 17580:                     // 'le' '('
    case 17582:                     // 'let' '('
    case 17584:                     // 'loop' '('
    case 17586:                     // 'lt' '('
    case 17588:                     // 'mod' '('
    case 17589:                     // 'modify' '('
    case 17590:                     // 'module' '('
    case 17592:                     // 'namespace' '('
    case 17594:                     // 'ne' '('
    case 17600:                     // 'nodes' '('
    case 17606:                     // 'only' '('
    case 17607:                     // 'option' '('
    case 17608:                     // 'or' '('
    case 17609:                     // 'order' '('
    case 17610:                     // 'ordered' '('
    case 17611:                     // 'ordering' '('
    case 17614:                     // 'parent' '('
    case 17620:                     // 'preceding' '('
    case 17621:                     // 'preceding-sibling' '('
    case 17626:                     // 'rename' '('
    case 17627:                     // 'replace' '('
    case 17628:                     // 'return' '('
    case 17629:                     // 'returning' '('
    case 17630:                     // 'revalidation' '('
    case 17632:                     // 'satisfies' '('
    case 17633:                     // 'schema' '('
    case 17636:                     // 'score' '('
    case 17637:                     // 'self' '('
    case 17642:                     // 'sliding' '('
    case 17643:                     // 'some' '('
    case 17644:                     // 'stable' '('
    case 17645:                     // 'start' '('
    case 17648:                     // 'strict' '('
    case 17656:                     // 'to' '('
    case 17657:                     // 'treat' '('
    case 17658:                     // 'try' '('
    case 17659:                     // 'tumbling' '('
    case 17660:                     // 'type' '('
    case 17662:                     // 'union' '('
    case 17664:                     // 'unordered' '('
    case 17665:                     // 'updating' '('
    case 17668:                     // 'validate' '('
    case 17669:                     // 'value' '('
    case 17670:                     // 'variable' '('
    case 17671:                     // 'version' '('
    case 17674:                     // 'where' '('
    case 17675:                     // 'while' '('
    case 17678:                     // 'with' '('
    case 17682:                     // 'xquery' '('
    case 36946:                     // 'attribute' 'allowing'
    case 36985:                     // 'element' 'allowing'
    case 37048:                     // 'namespace' 'allowing'
    case 37080:                     // 'processing-instruction' 'allowing'
    case 37458:                     // 'attribute' 'ancestor'
    case 37497:                     // 'element' 'ancestor'
    case 37560:                     // 'namespace' 'ancestor'
    case 37592:                     // 'processing-instruction' 'ancestor'
    case 37970:                     // 'attribute' 'ancestor-or-self'
    case 38009:                     // 'element' 'ancestor-or-self'
    case 38072:                     // 'namespace' 'ancestor-or-self'
    case 38104:                     // 'processing-instruction' 'ancestor-or-self'
    case 42066:                     // 'attribute' 'attribute'
    case 42105:                     // 'element' 'attribute'
    case 42168:                     // 'namespace' 'attribute'
    case 42200:                     // 'processing-instruction' 'attribute'
    case 42578:                     // 'attribute' 'base-uri'
    case 42617:                     // 'element' 'base-uri'
    case 42680:                     // 'namespace' 'base-uri'
    case 42712:                     // 'processing-instruction' 'base-uri'
    case 43602:                     // 'attribute' 'boundary-space'
    case 43641:                     // 'element' 'boundary-space'
    case 43704:                     // 'namespace' 'boundary-space'
    case 43736:                     // 'processing-instruction' 'boundary-space'
    case 44114:                     // 'attribute' 'break'
    case 44153:                     // 'element' 'break'
    case 44216:                     // 'namespace' 'break'
    case 44248:                     // 'processing-instruction' 'break'
    case 46674:                     // 'attribute' 'catch'
    case 46713:                     // 'element' 'catch'
    case 46776:                     // 'namespace' 'catch'
    case 46808:                     // 'processing-instruction' 'catch'
    case 47698:                     // 'attribute' 'child'
    case 47737:                     // 'element' 'child'
    case 47800:                     // 'namespace' 'child'
    case 47832:                     // 'processing-instruction' 'child'
    case 49234:                     // 'attribute' 'comment'
    case 49273:                     // 'element' 'comment'
    case 49336:                     // 'namespace' 'comment'
    case 49368:                     // 'processing-instruction' 'comment'
    case 49746:                     // 'attribute' 'constraint'
    case 49785:                     // 'element' 'constraint'
    case 49848:                     // 'namespace' 'constraint'
    case 49880:                     // 'processing-instruction' 'constraint'
    case 50258:                     // 'attribute' 'construction'
    case 50297:                     // 'element' 'construction'
    case 50360:                     // 'namespace' 'construction'
    case 50392:                     // 'processing-instruction' 'construction'
    case 51794:                     // 'attribute' 'context'
    case 51833:                     // 'element' 'context'
    case 51896:                     // 'namespace' 'context'
    case 51928:                     // 'processing-instruction' 'context'
    case 52306:                     // 'attribute' 'continue'
    case 52345:                     // 'element' 'continue'
    case 52408:                     // 'namespace' 'continue'
    case 52440:                     // 'processing-instruction' 'continue'
    case 52818:                     // 'attribute' 'copy'
    case 52857:                     // 'element' 'copy'
    case 52920:                     // 'namespace' 'copy'
    case 52952:                     // 'processing-instruction' 'copy'
    case 53330:                     // 'attribute' 'copy-namespaces'
    case 53369:                     // 'element' 'copy-namespaces'
    case 53432:                     // 'namespace' 'copy-namespaces'
    case 53464:                     // 'processing-instruction' 'copy-namespaces'
    case 54354:                     // 'attribute' 'decimal-format'
    case 54393:                     // 'element' 'decimal-format'
    case 54456:                     // 'namespace' 'decimal-format'
    case 54488:                     // 'processing-instruction' 'decimal-format'
    case 55378:                     // 'attribute' 'declare'
    case 55417:                     // 'element' 'declare'
    case 55480:                     // 'namespace' 'declare'
    case 55512:                     // 'processing-instruction' 'declare'
    case 56402:                     // 'attribute' 'delete'
    case 56441:                     // 'element' 'delete'
    case 56504:                     // 'namespace' 'delete'
    case 56536:                     // 'processing-instruction' 'delete'
    case 56914:                     // 'attribute' 'descendant'
    case 56953:                     // 'element' 'descendant'
    case 57016:                     // 'namespace' 'descendant'
    case 57048:                     // 'processing-instruction' 'descendant'
    case 57426:                     // 'attribute' 'descendant-or-self'
    case 57465:                     // 'element' 'descendant-or-self'
    case 57528:                     // 'namespace' 'descendant-or-self'
    case 57560:                     // 'processing-instruction' 'descendant-or-self'
    case 61010:                     // 'attribute' 'document'
    case 61049:                     // 'element' 'document'
    case 61112:                     // 'namespace' 'document'
    case 61144:                     // 'processing-instruction' 'document'
    case 61522:                     // 'attribute' 'document-node'
    case 61561:                     // 'element' 'document-node'
    case 61624:                     // 'namespace' 'document-node'
    case 61656:                     // 'processing-instruction' 'document-node'
    case 62034:                     // 'attribute' 'element'
    case 62073:                     // 'element' 'element'
    case 62136:                     // 'namespace' 'element'
    case 62168:                     // 'processing-instruction' 'element'
    case 63570:                     // 'attribute' 'empty-sequence'
    case 63609:                     // 'element' 'empty-sequence'
    case 63672:                     // 'namespace' 'empty-sequence'
    case 63704:                     // 'processing-instruction' 'empty-sequence'
    case 64082:                     // 'attribute' 'encoding'
    case 64121:                     // 'element' 'encoding'
    case 64184:                     // 'namespace' 'encoding'
    case 64216:                     // 'processing-instruction' 'encoding'
    case 66130:                     // 'attribute' 'every'
    case 66169:                     // 'element' 'every'
    case 66232:                     // 'namespace' 'every'
    case 66264:                     // 'processing-instruction' 'every'
    case 67666:                     // 'attribute' 'exit'
    case 67705:                     // 'element' 'exit'
    case 67768:                     // 'namespace' 'exit'
    case 67800:                     // 'processing-instruction' 'exit'
    case 68178:                     // 'attribute' 'external'
    case 68217:                     // 'element' 'external'
    case 68280:                     // 'namespace' 'external'
    case 68312:                     // 'processing-instruction' 'external'
    case 68690:                     // 'attribute' 'first'
    case 68729:                     // 'element' 'first'
    case 68792:                     // 'namespace' 'first'
    case 68824:                     // 'processing-instruction' 'first'
    case 69202:                     // 'attribute' 'following'
    case 69241:                     // 'element' 'following'
    case 69304:                     // 'namespace' 'following'
    case 69336:                     // 'processing-instruction' 'following'
    case 69714:                     // 'attribute' 'following-sibling'
    case 69753:                     // 'element' 'following-sibling'
    case 69816:                     // 'namespace' 'following-sibling'
    case 69848:                     // 'processing-instruction' 'following-sibling'
    case 72274:                     // 'attribute' 'ft-option'
    case 72313:                     // 'element' 'ft-option'
    case 72376:                     // 'namespace' 'ft-option'
    case 72408:                     // 'processing-instruction' 'ft-option'
    case 74322:                     // 'attribute' 'function'
    case 74361:                     // 'element' 'function'
    case 74424:                     // 'namespace' 'function'
    case 74456:                     // 'processing-instruction' 'function'
    case 77906:                     // 'attribute' 'if'
    case 77945:                     // 'element' 'if'
    case 78008:                     // 'namespace' 'if'
    case 78040:                     // 'processing-instruction' 'if'
    case 78418:                     // 'attribute' 'import'
    case 78457:                     // 'element' 'import'
    case 78520:                     // 'namespace' 'import'
    case 78552:                     // 'processing-instruction' 'import'
    case 78930:                     // 'attribute' 'in'
    case 78969:                     // 'element' 'in'
    case 79032:                     // 'namespace' 'in'
    case 79064:                     // 'processing-instruction' 'in'
    case 79442:                     // 'attribute' 'index'
    case 79481:                     // 'element' 'index'
    case 79544:                     // 'namespace' 'index'
    case 79576:                     // 'processing-instruction' 'index'
    case 81490:                     // 'attribute' 'insert'
    case 81529:                     // 'element' 'insert'
    case 81592:                     // 'namespace' 'insert'
    case 81624:                     // 'processing-instruction' 'insert'
    case 82514:                     // 'attribute' 'integrity'
    case 82553:                     // 'element' 'integrity'
    case 82616:                     // 'namespace' 'integrity'
    case 82648:                     // 'processing-instruction' 'integrity'
    case 84562:                     // 'attribute' 'item'
    case 84601:                     // 'element' 'item'
    case 84664:                     // 'namespace' 'item'
    case 84696:                     // 'processing-instruction' 'item'
    case 87122:                     // 'attribute' 'last'
    case 87161:                     // 'element' 'last'
    case 87224:                     // 'namespace' 'last'
    case 87256:                     // 'processing-instruction' 'last'
    case 87634:                     // 'attribute' 'lax'
    case 87673:                     // 'element' 'lax'
    case 87736:                     // 'namespace' 'lax'
    case 87768:                     // 'processing-instruction' 'lax'
    case 90194:                     // 'attribute' 'loop'
    case 90233:                     // 'element' 'loop'
    case 90296:                     // 'namespace' 'loop'
    case 90328:                     // 'processing-instruction' 'loop'
    case 93266:                     // 'attribute' 'module'
    case 93305:                     // 'element' 'module'
    case 93368:                     // 'namespace' 'module'
    case 93400:                     // 'processing-instruction' 'module'
    case 94290:                     // 'attribute' 'namespace'
    case 94329:                     // 'element' 'namespace'
    case 94392:                     // 'namespace' 'namespace'
    case 94424:                     // 'processing-instruction' 'namespace'
    case 94802:                     // 'attribute' 'namespace-node'
    case 94841:                     // 'element' 'namespace-node'
    case 94904:                     // 'namespace' 'namespace-node'
    case 94936:                     // 'processing-instruction' 'namespace-node'
    case 97874:                     // 'attribute' 'node'
    case 97913:                     // 'element' 'node'
    case 97976:                     // 'namespace' 'node'
    case 98008:                     // 'processing-instruction' 'node'
    case 98386:                     // 'attribute' 'nodes'
    case 98425:                     // 'element' 'nodes'
    case 98488:                     // 'namespace' 'nodes'
    case 98520:                     // 'processing-instruction' 'nodes'
    case 101970:                    // 'attribute' 'option'
    case 102009:                    // 'element' 'option'
    case 102072:                    // 'namespace' 'option'
    case 102104:                    // 'processing-instruction' 'option'
    case 103506:                    // 'attribute' 'ordered'
    case 103545:                    // 'element' 'ordered'
    case 103608:                    // 'namespace' 'ordered'
    case 103640:                    // 'processing-instruction' 'ordered'
    case 104018:                    // 'attribute' 'ordering'
    case 104057:                    // 'element' 'ordering'
    case 104120:                    // 'namespace' 'ordering'
    case 104152:                    // 'processing-instruction' 'ordering'
    case 105554:                    // 'attribute' 'parent'
    case 105593:                    // 'element' 'parent'
    case 105656:                    // 'namespace' 'parent'
    case 105688:                    // 'processing-instruction' 'parent'
    case 108626:                    // 'attribute' 'preceding'
    case 108665:                    // 'element' 'preceding'
    case 108728:                    // 'namespace' 'preceding'
    case 108760:                    // 'processing-instruction' 'preceding'
    case 109138:                    // 'attribute' 'preceding-sibling'
    case 109177:                    // 'element' 'preceding-sibling'
    case 109240:                    // 'namespace' 'preceding-sibling'
    case 109272:                    // 'processing-instruction' 'preceding-sibling'
    case 110674:                    // 'attribute' 'processing-instruction'
    case 110713:                    // 'element' 'processing-instruction'
    case 110776:                    // 'namespace' 'processing-instruction'
    case 110808:                    // 'processing-instruction' 'processing-instruction'
    case 111698:                    // 'attribute' 'rename'
    case 111737:                    // 'element' 'rename'
    case 111800:                    // 'namespace' 'rename'
    case 111832:                    // 'processing-instruction' 'rename'
    case 112210:                    // 'attribute' 'replace'
    case 112249:                    // 'element' 'replace'
    case 112312:                    // 'namespace' 'replace'
    case 112344:                    // 'processing-instruction' 'replace'
    case 113234:                    // 'attribute' 'returning'
    case 113273:                    // 'element' 'returning'
    case 113336:                    // 'namespace' 'returning'
    case 113368:                    // 'processing-instruction' 'returning'
    case 113746:                    // 'attribute' 'revalidation'
    case 113785:                    // 'element' 'revalidation'
    case 113848:                    // 'namespace' 'revalidation'
    case 113880:                    // 'processing-instruction' 'revalidation'
    case 115282:                    // 'attribute' 'schema'
    case 115321:                    // 'element' 'schema'
    case 115384:                    // 'namespace' 'schema'
    case 115416:                    // 'processing-instruction' 'schema'
    case 115794:                    // 'attribute' 'schema-attribute'
    case 115833:                    // 'element' 'schema-attribute'
    case 115896:                    // 'namespace' 'schema-attribute'
    case 115928:                    // 'processing-instruction' 'schema-attribute'
    case 116306:                    // 'attribute' 'schema-element'
    case 116345:                    // 'element' 'schema-element'
    case 116408:                    // 'namespace' 'schema-element'
    case 116440:                    // 'processing-instruction' 'schema-element'
    case 116818:                    // 'attribute' 'score'
    case 116857:                    // 'element' 'score'
    case 116920:                    // 'namespace' 'score'
    case 116952:                    // 'processing-instruction' 'score'
    case 117330:                    // 'attribute' 'self'
    case 117369:                    // 'element' 'self'
    case 117432:                    // 'namespace' 'self'
    case 117464:                    // 'processing-instruction' 'self'
    case 119890:                    // 'attribute' 'sliding'
    case 119929:                    // 'element' 'sliding'
    case 119992:                    // 'namespace' 'sliding'
    case 120024:                    // 'processing-instruction' 'sliding'
    case 120402:                    // 'attribute' 'some'
    case 120441:                    // 'element' 'some'
    case 120504:                    // 'namespace' 'some'
    case 120536:                    // 'processing-instruction' 'some'
    case 122962:                    // 'attribute' 'strict'
    case 123001:                    // 'element' 'strict'
    case 123064:                    // 'namespace' 'strict'
    case 123096:                    // 'processing-instruction' 'strict'
    case 124498:                    // 'attribute' 'switch'
    case 124537:                    // 'element' 'switch'
    case 124600:                    // 'namespace' 'switch'
    case 124632:                    // 'processing-instruction' 'switch'
    case 125010:                    // 'attribute' 'text'
    case 125049:                    // 'element' 'text'
    case 125112:                    // 'namespace' 'text'
    case 125144:                    // 'processing-instruction' 'text'
    case 128082:                    // 'attribute' 'try'
    case 128121:                    // 'element' 'try'
    case 128184:                    // 'namespace' 'try'
    case 128216:                    // 'processing-instruction' 'try'
    case 128594:                    // 'attribute' 'tumbling'
    case 128633:                    // 'element' 'tumbling'
    case 128696:                    // 'namespace' 'tumbling'
    case 128728:                    // 'processing-instruction' 'tumbling'
    case 129106:                    // 'attribute' 'type'
    case 129145:                    // 'element' 'type'
    case 129208:                    // 'namespace' 'type'
    case 129240:                    // 'processing-instruction' 'type'
    case 129618:                    // 'attribute' 'typeswitch'
    case 129657:                    // 'element' 'typeswitch'
    case 129720:                    // 'namespace' 'typeswitch'
    case 129752:                    // 'processing-instruction' 'typeswitch'
    case 131154:                    // 'attribute' 'unordered'
    case 131193:                    // 'element' 'unordered'
    case 131256:                    // 'namespace' 'unordered'
    case 131288:                    // 'processing-instruction' 'unordered'
    case 131666:                    // 'attribute' 'updating'
    case 131705:                    // 'element' 'updating'
    case 131768:                    // 'namespace' 'updating'
    case 131800:                    // 'processing-instruction' 'updating'
    case 133202:                    // 'attribute' 'validate'
    case 133241:                    // 'element' 'validate'
    case 133304:                    // 'namespace' 'validate'
    case 133336:                    // 'processing-instruction' 'validate'
    case 133714:                    // 'attribute' 'value'
    case 133753:                    // 'element' 'value'
    case 133816:                    // 'namespace' 'value'
    case 133848:                    // 'processing-instruction' 'value'
    case 134226:                    // 'attribute' 'variable'
    case 134265:                    // 'element' 'variable'
    case 134328:                    // 'namespace' 'variable'
    case 134360:                    // 'processing-instruction' 'variable'
    case 134738:                    // 'attribute' 'version'
    case 134777:                    // 'element' 'version'
    case 134840:                    // 'namespace' 'version'
    case 134872:                    // 'processing-instruction' 'version'
    case 136786:                    // 'attribute' 'while'
    case 136825:                    // 'element' 'while'
    case 136888:                    // 'namespace' 'while'
    case 136920:                    // 'processing-instruction' 'while'
    case 140370:                    // 'attribute' 'xquery'
    case 140409:                    // 'element' 'xquery'
    case 140472:                    // 'namespace' 'xquery'
    case 140504:                    // 'processing-instruction' 'xquery'
    case 141394:                    // 'attribute' '{'
    case 141408:                    // 'comment' '{'
    case 141431:                    // 'document' '{'
    case 141433:                    // 'element' '{'
    case 141496:                    // 'namespace' '{'
    case 141514:                    // 'ordered' '{'
    case 141528:                    // 'processing-instruction' '{'
    case 141556:                    // 'text' '{'
    case 141568:                    // 'unordered' '{'
      parse_PostfixExpr();
      break;
    default:
      parse_AxisStep();
    }
    eventHandler.endNonterminal("StepExpr", e0);
  }

  function try_StepExpr()
  {
    switch (l1)
    {
    case 82:                        // 'attribute'
      lookahead2W(282);             // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' |
      break;
    case 121:                       // 'element'
      lookahead2W(279);             // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' |
      break;
    case 184:                       // 'namespace'
    case 216:                       // 'processing-instruction'
      lookahead2W(280);             // NCName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' |
      break;
    case 96:                        // 'comment'
    case 119:                       // 'document'
    case 202:                       // 'ordered'
    case 244:                       // 'text'
    case 256:                       // 'unordered'
      lookahead2W(245);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    case 124:                       // 'empty-sequence'
    case 152:                       // 'if'
    case 165:                       // 'item'
    case 243:                       // 'switch'
    case 253:                       // 'typeswitch'
      lookahead2W(238);             // S^WS | EOF | '!' | '!=' | '#' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    case 73:                        // 'ancestor'
    case 74:                        // 'ancestor-or-self'
    case 93:                        // 'child'
    case 111:                       // 'descendant'
    case 112:                       // 'descendant-or-self'
    case 135:                       // 'following'
    case 136:                       // 'following-sibling'
    case 206:                       // 'parent'
    case 212:                       // 'preceding'
    case 213:                       // 'preceding-sibling'
    case 229:                       // 'self'
      lookahead2W(244);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    case 6:                         // EQName^Token
    case 70:                        // 'after'
    case 72:                        // 'allowing'
    case 75:                        // 'and'
    case 79:                        // 'as'
    case 80:                        // 'ascending'
    case 81:                        // 'at'
    case 83:                        // 'base-uri'
    case 84:                        // 'before'
    case 85:                        // 'boundary-space'
    case 86:                        // 'break'
    case 88:                        // 'case'
    case 89:                        // 'cast'
    case 90:                        // 'castable'
    case 91:                        // 'catch'
    case 94:                        // 'collation'
    case 97:                        // 'constraint'
    case 98:                        // 'construction'
    case 101:                       // 'context'
    case 102:                       // 'continue'
    case 103:                       // 'copy'
    case 104:                       // 'copy-namespaces'
    case 105:                       // 'count'
    case 106:                       // 'decimal-format'
    case 108:                       // 'declare'
    case 109:                       // 'default'
    case 110:                       // 'delete'
    case 113:                       // 'descending'
    case 118:                       // 'div'
    case 120:                       // 'document-node'
    case 122:                       // 'else'
    case 123:                       // 'empty'
    case 125:                       // 'encoding'
    case 126:                       // 'end'
    case 128:                       // 'eq'
    case 129:                       // 'every'
    case 131:                       // 'except'
    case 132:                       // 'exit'
    case 133:                       // 'external'
    case 134:                       // 'first'
    case 137:                       // 'for'
    case 141:                       // 'ft-option'
    case 145:                       // 'function'
    case 146:                       // 'ge'
    case 148:                       // 'group'
    case 150:                       // 'gt'
    case 151:                       // 'idiv'
    case 153:                       // 'import'
    case 154:                       // 'in'
    case 155:                       // 'index'
    case 159:                       // 'insert'
    case 160:                       // 'instance'
    case 161:                       // 'integrity'
    case 162:                       // 'intersect'
    case 163:                       // 'into'
    case 164:                       // 'is'
    case 170:                       // 'last'
    case 171:                       // 'lax'
    case 172:                       // 'le'
    case 174:                       // 'let'
    case 176:                       // 'loop'
    case 178:                       // 'lt'
    case 180:                       // 'mod'
    case 181:                       // 'modify'
    case 182:                       // 'module'
    case 185:                       // 'namespace-node'
    case 186:                       // 'ne'
    case 191:                       // 'node'
    case 192:                       // 'nodes'
    case 198:                       // 'only'
    case 199:                       // 'option'
    case 200:                       // 'or'
    case 201:                       // 'order'
    case 203:                       // 'ordering'
    case 218:                       // 'rename'
    case 219:                       // 'replace'
    case 220:                       // 'return'
    case 221:                       // 'returning'
    case 222:                       // 'revalidation'
    case 224:                       // 'satisfies'
    case 225:                       // 'schema'
    case 226:                       // 'schema-attribute'
    case 227:                       // 'schema-element'
    case 228:                       // 'score'
    case 234:                       // 'sliding'
    case 235:                       // 'some'
    case 236:                       // 'stable'
    case 237:                       // 'start'
    case 240:                       // 'strict'
    case 248:                       // 'to'
    case 249:                       // 'treat'
    case 250:                       // 'try'
    case 251:                       // 'tumbling'
    case 252:                       // 'type'
    case 254:                       // 'union'
    case 257:                       // 'updating'
    case 260:                       // 'validate'
    case 261:                       // 'value'
    case 262:                       // 'variable'
    case 263:                       // 'version'
    case 266:                       // 'where'
    case 267:                       // 'while'
    case 270:                       // 'with'
    case 274:                       // 'xquery'
      lookahead2W(242);             // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' |
      break;
    default:
      lk = l1;
    }
    if (lk == 35922                 // 'attribute' 'after'
     || lk == 35961                 // 'element' 'after'
     || lk == 36024                 // 'namespace' 'after'
     || lk == 36056                 // 'processing-instruction' 'after'
     || lk == 38482                 // 'attribute' 'and'
     || lk == 38521                 // 'element' 'and'
     || lk == 38584                 // 'namespace' 'and'
     || lk == 38616                 // 'processing-instruction' 'and'
     || lk == 40530                 // 'attribute' 'as'
     || lk == 40569                 // 'element' 'as'
     || lk == 40632                 // 'namespace' 'as'
     || lk == 40664                 // 'processing-instruction' 'as'
     || lk == 41042                 // 'attribute' 'ascending'
     || lk == 41081                 // 'element' 'ascending'
     || lk == 41144                 // 'namespace' 'ascending'
     || lk == 41176                 // 'processing-instruction' 'ascending'
     || lk == 41554                 // 'attribute' 'at'
     || lk == 41593                 // 'element' 'at'
     || lk == 41656                 // 'namespace' 'at'
     || lk == 41688                 // 'processing-instruction' 'at'
     || lk == 43090                 // 'attribute' 'before'
     || lk == 43129                 // 'element' 'before'
     || lk == 43192                 // 'namespace' 'before'
     || lk == 43224                 // 'processing-instruction' 'before'
     || lk == 45138                 // 'attribute' 'case'
     || lk == 45177                 // 'element' 'case'
     || lk == 45240                 // 'namespace' 'case'
     || lk == 45272                 // 'processing-instruction' 'case'
     || lk == 45650                 // 'attribute' 'cast'
     || lk == 45689                 // 'element' 'cast'
     || lk == 45752                 // 'namespace' 'cast'
     || lk == 45784                 // 'processing-instruction' 'cast'
     || lk == 46162                 // 'attribute' 'castable'
     || lk == 46201                 // 'element' 'castable'
     || lk == 46264                 // 'namespace' 'castable'
     || lk == 46296                 // 'processing-instruction' 'castable'
     || lk == 48210                 // 'attribute' 'collation'
     || lk == 48249                 // 'element' 'collation'
     || lk == 48312                 // 'namespace' 'collation'
     || lk == 48344                 // 'processing-instruction' 'collation'
     || lk == 53842                 // 'attribute' 'count'
     || lk == 53881                 // 'element' 'count'
     || lk == 53944                 // 'namespace' 'count'
     || lk == 53976                 // 'processing-instruction' 'count'
     || lk == 55890                 // 'attribute' 'default'
     || lk == 55929                 // 'element' 'default'
     || lk == 55992                 // 'namespace' 'default'
     || lk == 56024                 // 'processing-instruction' 'default'
     || lk == 57938                 // 'attribute' 'descending'
     || lk == 57977                 // 'element' 'descending'
     || lk == 58040                 // 'namespace' 'descending'
     || lk == 58072                 // 'processing-instruction' 'descending'
     || lk == 60498                 // 'attribute' 'div'
     || lk == 60537                 // 'element' 'div'
     || lk == 60600                 // 'namespace' 'div'
     || lk == 60632                 // 'processing-instruction' 'div'
     || lk == 62546                 // 'attribute' 'else'
     || lk == 62585                 // 'element' 'else'
     || lk == 62648                 // 'namespace' 'else'
     || lk == 62680                 // 'processing-instruction' 'else'
     || lk == 63058                 // 'attribute' 'empty'
     || lk == 63097                 // 'element' 'empty'
     || lk == 63160                 // 'namespace' 'empty'
     || lk == 63192                 // 'processing-instruction' 'empty'
     || lk == 64594                 // 'attribute' 'end'
     || lk == 64633                 // 'element' 'end'
     || lk == 64696                 // 'namespace' 'end'
     || lk == 64728                 // 'processing-instruction' 'end'
     || lk == 65618                 // 'attribute' 'eq'
     || lk == 65657                 // 'element' 'eq'
     || lk == 65720                 // 'namespace' 'eq'
     || lk == 65752                 // 'processing-instruction' 'eq'
     || lk == 67154                 // 'attribute' 'except'
     || lk == 67193                 // 'element' 'except'
     || lk == 67256                 // 'namespace' 'except'
     || lk == 67288                 // 'processing-instruction' 'except'
     || lk == 70226                 // 'attribute' 'for'
     || lk == 70265                 // 'element' 'for'
     || lk == 70328                 // 'namespace' 'for'
     || lk == 70360                 // 'processing-instruction' 'for'
     || lk == 74834                 // 'attribute' 'ge'
     || lk == 74873                 // 'element' 'ge'
     || lk == 74936                 // 'namespace' 'ge'
     || lk == 74968                 // 'processing-instruction' 'ge'
     || lk == 75858                 // 'attribute' 'group'
     || lk == 75897                 // 'element' 'group'
     || lk == 75960                 // 'namespace' 'group'
     || lk == 75992                 // 'processing-instruction' 'group'
     || lk == 76882                 // 'attribute' 'gt'
     || lk == 76921                 // 'element' 'gt'
     || lk == 76984                 // 'namespace' 'gt'
     || lk == 77016                 // 'processing-instruction' 'gt'
     || lk == 77394                 // 'attribute' 'idiv'
     || lk == 77433                 // 'element' 'idiv'
     || lk == 77496                 // 'namespace' 'idiv'
     || lk == 77528                 // 'processing-instruction' 'idiv'
     || lk == 82002                 // 'attribute' 'instance'
     || lk == 82041                 // 'element' 'instance'
     || lk == 82104                 // 'namespace' 'instance'
     || lk == 82136                 // 'processing-instruction' 'instance'
     || lk == 83026                 // 'attribute' 'intersect'
     || lk == 83065                 // 'element' 'intersect'
     || lk == 83128                 // 'namespace' 'intersect'
     || lk == 83160                 // 'processing-instruction' 'intersect'
     || lk == 83538                 // 'attribute' 'into'
     || lk == 83577                 // 'element' 'into'
     || lk == 83640                 // 'namespace' 'into'
     || lk == 83672                 // 'processing-instruction' 'into'
     || lk == 84050                 // 'attribute' 'is'
     || lk == 84089                 // 'element' 'is'
     || lk == 84152                 // 'namespace' 'is'
     || lk == 84184                 // 'processing-instruction' 'is'
     || lk == 88146                 // 'attribute' 'le'
     || lk == 88185                 // 'element' 'le'
     || lk == 88248                 // 'namespace' 'le'
     || lk == 88280                 // 'processing-instruction' 'le'
     || lk == 89170                 // 'attribute' 'let'
     || lk == 89209                 // 'element' 'let'
     || lk == 89272                 // 'namespace' 'let'
     || lk == 89304                 // 'processing-instruction' 'let'
     || lk == 91218                 // 'attribute' 'lt'
     || lk == 91257                 // 'element' 'lt'
     || lk == 91320                 // 'namespace' 'lt'
     || lk == 91352                 // 'processing-instruction' 'lt'
     || lk == 92242                 // 'attribute' 'mod'
     || lk == 92281                 // 'element' 'mod'
     || lk == 92344                 // 'namespace' 'mod'
     || lk == 92376                 // 'processing-instruction' 'mod'
     || lk == 92754                 // 'attribute' 'modify'
     || lk == 92793                 // 'element' 'modify'
     || lk == 92856                 // 'namespace' 'modify'
     || lk == 92888                 // 'processing-instruction' 'modify'
     || lk == 95314                 // 'attribute' 'ne'
     || lk == 95353                 // 'element' 'ne'
     || lk == 95416                 // 'namespace' 'ne'
     || lk == 95448                 // 'processing-instruction' 'ne'
     || lk == 101458                // 'attribute' 'only'
     || lk == 101497                // 'element' 'only'
     || lk == 101560                // 'namespace' 'only'
     || lk == 101592                // 'processing-instruction' 'only'
     || lk == 102482                // 'attribute' 'or'
     || lk == 102521                // 'element' 'or'
     || lk == 102584                // 'namespace' 'or'
     || lk == 102616                // 'processing-instruction' 'or'
     || lk == 102994                // 'attribute' 'order'
     || lk == 103033                // 'element' 'order'
     || lk == 103096                // 'namespace' 'order'
     || lk == 103128                // 'processing-instruction' 'order'
     || lk == 112722                // 'attribute' 'return'
     || lk == 112761                // 'element' 'return'
     || lk == 112824                // 'namespace' 'return'
     || lk == 112856                // 'processing-instruction' 'return'
     || lk == 114770                // 'attribute' 'satisfies'
     || lk == 114809                // 'element' 'satisfies'
     || lk == 114872                // 'namespace' 'satisfies'
     || lk == 114904                // 'processing-instruction' 'satisfies'
     || lk == 120914                // 'attribute' 'stable'
     || lk == 120953                // 'element' 'stable'
     || lk == 121016                // 'namespace' 'stable'
     || lk == 121048                // 'processing-instruction' 'stable'
     || lk == 121426                // 'attribute' 'start'
     || lk == 121465                // 'element' 'start'
     || lk == 121528                // 'namespace' 'start'
     || lk == 121560                // 'processing-instruction' 'start'
     || lk == 127058                // 'attribute' 'to'
     || lk == 127097                // 'element' 'to'
     || lk == 127160                // 'namespace' 'to'
     || lk == 127192                // 'processing-instruction' 'to'
     || lk == 127570                // 'attribute' 'treat'
     || lk == 127609                // 'element' 'treat'
     || lk == 127672                // 'namespace' 'treat'
     || lk == 127704                // 'processing-instruction' 'treat'
     || lk == 130130                // 'attribute' 'union'
     || lk == 130169                // 'element' 'union'
     || lk == 130232                // 'namespace' 'union'
     || lk == 130264                // 'processing-instruction' 'union'
     || lk == 136274                // 'attribute' 'where'
     || lk == 136313                // 'element' 'where'
     || lk == 136376                // 'namespace' 'where'
     || lk == 136408                // 'processing-instruction' 'where'
     || lk == 138322                // 'attribute' 'with'
     || lk == 138361                // 'element' 'with'
     || lk == 138424                // 'namespace' 'with'
     || lk == 138456)               // 'processing-instruction' 'with'
    {
      lk = memoized(3, e0);
      if (lk == 0)
      {
        var b0A = b0; var e0A = e0; var l1A = l1;
        var b1A = b1; var e1A = e1; var l2A = l2;
        var b2A = b2; var e2A = e2;
        try
        {
          try_PostfixExpr();
          lk = -1;
        }
        catch (p1A)
        {
          lk = -2;
        }
        b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
        b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
        b2 = b2A; e2 = e2A; end = e2A; }}
        memoize(3, e0, lk);
      }
    }
    switch (lk)
    {
    case -1:
    case 8:                         // IntegerLiteral
    case 9:                         // DecimalLiteral
    case 10:                        // DoubleLiteral
    case 11:                        // StringLiteral
    case 31:                        // '$'
    case 32:                        // '%'
    case 34:                        // '('
    case 44:                        // '.'
    case 54:                        // '<'
    case 55:                        // '<!--'
    case 59:                        // '<?'
    case 68:                        // '['
    case 276:                       // '{'
    case 278:                       // '{|'
    case 3154:                      // 'attribute' EQName^Token
    case 3193:                      // 'element' EQName^Token
    case 9912:                      // 'namespace' NCName^Token
    case 9944:                      // 'processing-instruction' NCName^Token
    case 14854:                     // EQName^Token '#'
    case 14918:                     // 'after' '#'
    case 14920:                     // 'allowing' '#'
    case 14921:                     // 'ancestor' '#'
    case 14922:                     // 'ancestor-or-self' '#'
    case 14923:                     // 'and' '#'
    case 14927:                     // 'as' '#'
    case 14928:                     // 'ascending' '#'
    case 14929:                     // 'at' '#'
    case 14930:                     // 'attribute' '#'
    case 14931:                     // 'base-uri' '#'
    case 14932:                     // 'before' '#'
    case 14933:                     // 'boundary-space' '#'
    case 14934:                     // 'break' '#'
    case 14936:                     // 'case' '#'
    case 14937:                     // 'cast' '#'
    case 14938:                     // 'castable' '#'
    case 14939:                     // 'catch' '#'
    case 14941:                     // 'child' '#'
    case 14942:                     // 'collation' '#'
    case 14944:                     // 'comment' '#'
    case 14945:                     // 'constraint' '#'
    case 14946:                     // 'construction' '#'
    case 14949:                     // 'context' '#'
    case 14950:                     // 'continue' '#'
    case 14951:                     // 'copy' '#'
    case 14952:                     // 'copy-namespaces' '#'
    case 14953:                     // 'count' '#'
    case 14954:                     // 'decimal-format' '#'
    case 14956:                     // 'declare' '#'
    case 14957:                     // 'default' '#'
    case 14958:                     // 'delete' '#'
    case 14959:                     // 'descendant' '#'
    case 14960:                     // 'descendant-or-self' '#'
    case 14961:                     // 'descending' '#'
    case 14966:                     // 'div' '#'
    case 14967:                     // 'document' '#'
    case 14968:                     // 'document-node' '#'
    case 14969:                     // 'element' '#'
    case 14970:                     // 'else' '#'
    case 14971:                     // 'empty' '#'
    case 14972:                     // 'empty-sequence' '#'
    case 14973:                     // 'encoding' '#'
    case 14974:                     // 'end' '#'
    case 14976:                     // 'eq' '#'
    case 14977:                     // 'every' '#'
    case 14979:                     // 'except' '#'
    case 14980:                     // 'exit' '#'
    case 14981:                     // 'external' '#'
    case 14982:                     // 'first' '#'
    case 14983:                     // 'following' '#'
    case 14984:                     // 'following-sibling' '#'
    case 14985:                     // 'for' '#'
    case 14989:                     // 'ft-option' '#'
    case 14993:                     // 'function' '#'
    case 14994:                     // 'ge' '#'
    case 14996:                     // 'group' '#'
    case 14998:                     // 'gt' '#'
    case 14999:                     // 'idiv' '#'
    case 15000:                     // 'if' '#'
    case 15001:                     // 'import' '#'
    case 15002:                     // 'in' '#'
    case 15003:                     // 'index' '#'
    case 15007:                     // 'insert' '#'
    case 15008:                     // 'instance' '#'
    case 15009:                     // 'integrity' '#'
    case 15010:                     // 'intersect' '#'
    case 15011:                     // 'into' '#'
    case 15012:                     // 'is' '#'
    case 15013:                     // 'item' '#'
    case 15018:                     // 'last' '#'
    case 15019:                     // 'lax' '#'
    case 15020:                     // 'le' '#'
    case 15022:                     // 'let' '#'
    case 15024:                     // 'loop' '#'
    case 15026:                     // 'lt' '#'
    case 15028:                     // 'mod' '#'
    case 15029:                     // 'modify' '#'
    case 15030:                     // 'module' '#'
    case 15032:                     // 'namespace' '#'
    case 15033:                     // 'namespace-node' '#'
    case 15034:                     // 'ne' '#'
    case 15039:                     // 'node' '#'
    case 15040:                     // 'nodes' '#'
    case 15046:                     // 'only' '#'
    case 15047:                     // 'option' '#'
    case 15048:                     // 'or' '#'
    case 15049:                     // 'order' '#'
    case 15050:                     // 'ordered' '#'
    case 15051:                     // 'ordering' '#'
    case 15054:                     // 'parent' '#'
    case 15060:                     // 'preceding' '#'
    case 15061:                     // 'preceding-sibling' '#'
    case 15064:                     // 'processing-instruction' '#'
    case 15066:                     // 'rename' '#'
    case 15067:                     // 'replace' '#'
    case 15068:                     // 'return' '#'
    case 15069:                     // 'returning' '#'
    case 15070:                     // 'revalidation' '#'
    case 15072:                     // 'satisfies' '#'
    case 15073:                     // 'schema' '#'
    case 15074:                     // 'schema-attribute' '#'
    case 15075:                     // 'schema-element' '#'
    case 15076:                     // 'score' '#'
    case 15077:                     // 'self' '#'
    case 15082:                     // 'sliding' '#'
    case 15083:                     // 'some' '#'
    case 15084:                     // 'stable' '#'
    case 15085:                     // 'start' '#'
    case 15088:                     // 'strict' '#'
    case 15091:                     // 'switch' '#'
    case 15092:                     // 'text' '#'
    case 15096:                     // 'to' '#'
    case 15097:                     // 'treat' '#'
    case 15098:                     // 'try' '#'
    case 15099:                     // 'tumbling' '#'
    case 15100:                     // 'type' '#'
    case 15101:                     // 'typeswitch' '#'
    case 15102:                     // 'union' '#'
    case 15104:                     // 'unordered' '#'
    case 15105:                     // 'updating' '#'
    case 15108:                     // 'validate' '#'
    case 15109:                     // 'value' '#'
    case 15110:                     // 'variable' '#'
    case 15111:                     // 'version' '#'
    case 15114:                     // 'where' '#'
    case 15115:                     // 'while' '#'
    case 15118:                     // 'with' '#'
    case 15122:                     // 'xquery' '#'
    case 17414:                     // EQName^Token '('
    case 17478:                     // 'after' '('
    case 17480:                     // 'allowing' '('
    case 17481:                     // 'ancestor' '('
    case 17482:                     // 'ancestor-or-self' '('
    case 17483:                     // 'and' '('
    case 17487:                     // 'as' '('
    case 17488:                     // 'ascending' '('
    case 17489:                     // 'at' '('
    case 17491:                     // 'base-uri' '('
    case 17492:                     // 'before' '('
    case 17493:                     // 'boundary-space' '('
    case 17494:                     // 'break' '('
    case 17496:                     // 'case' '('
    case 17497:                     // 'cast' '('
    case 17498:                     // 'castable' '('
    case 17499:                     // 'catch' '('
    case 17501:                     // 'child' '('
    case 17502:                     // 'collation' '('
    case 17505:                     // 'constraint' '('
    case 17506:                     // 'construction' '('
    case 17509:                     // 'context' '('
    case 17510:                     // 'continue' '('
    case 17511:                     // 'copy' '('
    case 17512:                     // 'copy-namespaces' '('
    case 17513:                     // 'count' '('
    case 17514:                     // 'decimal-format' '('
    case 17516:                     // 'declare' '('
    case 17517:                     // 'default' '('
    case 17518:                     // 'delete' '('
    case 17519:                     // 'descendant' '('
    case 17520:                     // 'descendant-or-self' '('
    case 17521:                     // 'descending' '('
    case 17526:                     // 'div' '('
    case 17527:                     // 'document' '('
    case 17530:                     // 'else' '('
    case 17531:                     // 'empty' '('
    case 17533:                     // 'encoding' '('
    case 17534:                     // 'end' '('
    case 17536:                     // 'eq' '('
    case 17537:                     // 'every' '('
    case 17539:                     // 'except' '('
    case 17540:                     // 'exit' '('
    case 17541:                     // 'external' '('
    case 17542:                     // 'first' '('
    case 17543:                     // 'following' '('
    case 17544:                     // 'following-sibling' '('
    case 17545:                     // 'for' '('
    case 17549:                     // 'ft-option' '('
    case 17553:                     // 'function' '('
    case 17554:                     // 'ge' '('
    case 17556:                     // 'group' '('
    case 17558:                     // 'gt' '('
    case 17559:                     // 'idiv' '('
    case 17561:                     // 'import' '('
    case 17562:                     // 'in' '('
    case 17563:                     // 'index' '('
    case 17567:                     // 'insert' '('
    case 17568:                     // 'instance' '('
    case 17569:                     // 'integrity' '('
    case 17570:                     // 'intersect' '('
    case 17571:                     // 'into' '('
    case 17572:                     // 'is' '('
    case 17578:                     // 'last' '('
    case 17579:                     // 'lax' '('
    case 17580:                     // 'le' '('
    case 17582:                     // 'let' '('
    case 17584:                     // 'loop' '('
    case 17586:                     // 'lt' '('
    case 17588:                     // 'mod' '('
    case 17589:                     // 'modify' '('
    case 17590:                     // 'module' '('
    case 17592:                     // 'namespace' '('
    case 17594:                     // 'ne' '('
    case 17600:                     // 'nodes' '('
    case 17606:                     // 'only' '('
    case 17607:                     // 'option' '('
    case 17608:                     // 'or' '('
    case 17609:                     // 'order' '('
    case 17610:                     // 'ordered' '('
    case 17611:                     // 'ordering' '('
    case 17614:                     // 'parent' '('
    case 17620:                     // 'preceding' '('
    case 17621:                     // 'preceding-sibling' '('
    case 17626:                     // 'rename' '('
    case 17627:                     // 'replace' '('
    case 17628:                     // 'return' '('
    case 17629:                     // 'returning' '('
    case 17630:                     // 'revalidation' '('
    case 17632:                     // 'satisfies' '('
    case 17633:                     // 'schema' '('
    case 17636:                     // 'score' '('
    case 17637:                     // 'self' '('
    case 17642:                     // 'sliding' '('
    case 17643:                     // 'some' '('
    case 17644:                     // 'stable' '('
    case 17645:                     // 'start' '('
    case 17648:                     // 'strict' '('
    case 17656:                     // 'to' '('
    case 17657:                     // 'treat' '('
    case 17658:                     // 'try' '('
    case 17659:                     // 'tumbling' '('
    case 17660:                     // 'type' '('
    case 17662:                     // 'union' '('
    case 17664:                     // 'unordered' '('
    case 17665:                     // 'updating' '('
    case 17668:                     // 'validate' '('
    case 17669:                     // 'value' '('
    case 17670:                     // 'variable' '('
    case 17671:                     // 'version' '('
    case 17674:                     // 'where' '('
    case 17675:                     // 'while' '('
    case 17678:                     // 'with' '('
    case 17682:                     // 'xquery' '('
    case 36946:                     // 'attribute' 'allowing'
    case 36985:                     // 'element' 'allowing'
    case 37048:                     // 'namespace' 'allowing'
    case 37080:                     // 'processing-instruction' 'allowing'
    case 37458:                     // 'attribute' 'ancestor'
    case 37497:                     // 'element' 'ancestor'
    case 37560:                     // 'namespace' 'ancestor'
    case 37592:                     // 'processing-instruction' 'ancestor'
    case 37970:                     // 'attribute' 'ancestor-or-self'
    case 38009:                     // 'element' 'ancestor-or-self'
    case 38072:                     // 'namespace' 'ancestor-or-self'
    case 38104:                     // 'processing-instruction' 'ancestor-or-self'
    case 42066:                     // 'attribute' 'attribute'
    case 42105:                     // 'element' 'attribute'
    case 42168:                     // 'namespace' 'attribute'
    case 42200:                     // 'processing-instruction' 'attribute'
    case 42578:                     // 'attribute' 'base-uri'
    case 42617:                     // 'element' 'base-uri'
    case 42680:                     // 'namespace' 'base-uri'
    case 42712:                     // 'processing-instruction' 'base-uri'
    case 43602:                     // 'attribute' 'boundary-space'
    case 43641:                     // 'element' 'boundary-space'
    case 43704:                     // 'namespace' 'boundary-space'
    case 43736:                     // 'processing-instruction' 'boundary-space'
    case 44114:                     // 'attribute' 'break'
    case 44153:                     // 'element' 'break'
    case 44216:                     // 'namespace' 'break'
    case 44248:                     // 'processing-instruction' 'break'
    case 46674:                     // 'attribute' 'catch'
    case 46713:                     // 'element' 'catch'
    case 46776:                     // 'namespace' 'catch'
    case 46808:                     // 'processing-instruction' 'catch'
    case 47698:                     // 'attribute' 'child'
    case 47737:                     // 'element' 'child'
    case 47800:                     // 'namespace' 'child'
    case 47832:                     // 'processing-instruction' 'child'
    case 49234:                     // 'attribute' 'comment'
    case 49273:                     // 'element' 'comment'
    case 49336:                     // 'namespace' 'comment'
    case 49368:                     // 'processing-instruction' 'comment'
    case 49746:                     // 'attribute' 'constraint'
    case 49785:                     // 'element' 'constraint'
    case 49848:                     // 'namespace' 'constraint'
    case 49880:                     // 'processing-instruction' 'constraint'
    case 50258:                     // 'attribute' 'construction'
    case 50297:                     // 'element' 'construction'
    case 50360:                     // 'namespace' 'construction'
    case 50392:                     // 'processing-instruction' 'construction'
    case 51794:                     // 'attribute' 'context'
    case 51833:                     // 'element' 'context'
    case 51896:                     // 'namespace' 'context'
    case 51928:                     // 'processing-instruction' 'context'
    case 52306:                     // 'attribute' 'continue'
    case 52345:                     // 'element' 'continue'
    case 52408:                     // 'namespace' 'continue'
    case 52440:                     // 'processing-instruction' 'continue'
    case 52818:                     // 'attribute' 'copy'
    case 52857:                     // 'element' 'copy'
    case 52920:                     // 'namespace' 'copy'
    case 52952:                     // 'processing-instruction' 'copy'
    case 53330:                     // 'attribute' 'copy-namespaces'
    case 53369:                     // 'element' 'copy-namespaces'
    case 53432:                     // 'namespace' 'copy-namespaces'
    case 53464:                     // 'processing-instruction' 'copy-namespaces'
    case 54354:                     // 'attribute' 'decimal-format'
    case 54393:                     // 'element' 'decimal-format'
    case 54456:                     // 'namespace' 'decimal-format'
    case 54488:                     // 'processing-instruction' 'decimal-format'
    case 55378:                     // 'attribute' 'declare'
    case 55417:                     // 'element' 'declare'
    case 55480:                     // 'namespace' 'declare'
    case 55512:                     // 'processing-instruction' 'declare'
    case 56402:                     // 'attribute' 'delete'
    case 56441:                     // 'element' 'delete'
    case 56504:                     // 'namespace' 'delete'
    case 56536:                     // 'processing-instruction' 'delete'
    case 56914:                     // 'attribute' 'descendant'
    case 56953:                     // 'element' 'descendant'
    case 57016:                     // 'namespace' 'descendant'
    case 57048:                     // 'processing-instruction' 'descendant'
    case 57426:                     // 'attribute' 'descendant-or-self'
    case 57465:                     // 'element' 'descendant-or-self'
    case 57528:                     // 'namespace' 'descendant-or-self'
    case 57560:                     // 'processing-instruction' 'descendant-or-self'
    case 61010:                     // 'attribute' 'document'
    case 61049:                     // 'element' 'document'
    case 61112:                     // 'namespace' 'document'
    case 61144:                     // 'processing-instruction' 'document'
    case 61522:                     // 'attribute' 'document-node'
    case 61561:                     // 'element' 'document-node'
    case 61624:                     // 'namespace' 'document-node'
    case 61656:                     // 'processing-instruction' 'document-node'
    case 62034:                     // 'attribute' 'element'
    case 62073:                     // 'element' 'element'
    case 62136:                     // 'namespace' 'element'
    case 62168:                     // 'processing-instruction' 'element'
    case 63570:                     // 'attribute' 'empty-sequence'
    case 63609:                     // 'element' 'empty-sequence'
    case 63672:                     // 'namespace' 'empty-sequence'
    case 63704:                     // 'processing-instruction' 'empty-sequence'
    case 64082:                     // 'attribute' 'encoding'
    case 64121:                     // 'element' 'encoding'
    case 64184:                     // 'namespace' 'encoding'
    case 64216:                     // 'processing-instruction' 'encoding'
    case 66130:                     // 'attribute' 'every'
    case 66169:                     // 'element' 'every'
    case 66232:                     // 'namespace' 'every'
    case 66264:                     // 'processing-instruction' 'every'
    case 67666:                     // 'attribute' 'exit'
    case 67705:                     // 'element' 'exit'
    case 67768:                     // 'namespace' 'exit'
    case 67800:                     // 'processing-instruction' 'exit'
    case 68178:                     // 'attribute' 'external'
    case 68217:                     // 'element' 'external'
    case 68280:                     // 'namespace' 'external'
    case 68312:                     // 'processing-instruction' 'external'
    case 68690:                     // 'attribute' 'first'
    case 68729:                     // 'element' 'first'
    case 68792:                     // 'namespace' 'first'
    case 68824:                     // 'processing-instruction' 'first'
    case 69202:                     // 'attribute' 'following'
    case 69241:                     // 'element' 'following'
    case 69304:                     // 'namespace' 'following'
    case 69336:                     // 'processing-instruction' 'following'
    case 69714:                     // 'attribute' 'following-sibling'
    case 69753:                     // 'element' 'following-sibling'
    case 69816:                     // 'namespace' 'following-sibling'
    case 69848:                     // 'processing-instruction' 'following-sibling'
    case 72274:                     // 'attribute' 'ft-option'
    case 72313:                     // 'element' 'ft-option'
    case 72376:                     // 'namespace' 'ft-option'
    case 72408:                     // 'processing-instruction' 'ft-option'
    case 74322:                     // 'attribute' 'function'
    case 74361:                     // 'element' 'function'
    case 74424:                     // 'namespace' 'function'
    case 74456:                     // 'processing-instruction' 'function'
    case 77906:                     // 'attribute' 'if'
    case 77945:                     // 'element' 'if'
    case 78008:                     // 'namespace' 'if'
    case 78040:                     // 'processing-instruction' 'if'
    case 78418:                     // 'attribute' 'import'
    case 78457:                     // 'element' 'import'
    case 78520:                     // 'namespace' 'import'
    case 78552:                     // 'processing-instruction' 'import'
    case 78930:                     // 'attribute' 'in'
    case 78969:                     // 'element' 'in'
    case 79032:                     // 'namespace' 'in'
    case 79064:                     // 'processing-instruction' 'in'
    case 79442:                     // 'attribute' 'index'
    case 79481:                     // 'element' 'index'
    case 79544:                     // 'namespace' 'index'
    case 79576:                     // 'processing-instruction' 'index'
    case 81490:                     // 'attribute' 'insert'
    case 81529:                     // 'element' 'insert'
    case 81592:                     // 'namespace' 'insert'
    case 81624:                     // 'processing-instruction' 'insert'
    case 82514:                     // 'attribute' 'integrity'
    case 82553:                     // 'element' 'integrity'
    case 82616:                     // 'namespace' 'integrity'
    case 82648:                     // 'processing-instruction' 'integrity'
    case 84562:                     // 'attribute' 'item'
    case 84601:                     // 'element' 'item'
    case 84664:                     // 'namespace' 'item'
    case 84696:                     // 'processing-instruction' 'item'
    case 87122:                     // 'attribute' 'last'
    case 87161:                     // 'element' 'last'
    case 87224:                     // 'namespace' 'last'
    case 87256:                     // 'processing-instruction' 'last'
    case 87634:                     // 'attribute' 'lax'
    case 87673:                     // 'element' 'lax'
    case 87736:                     // 'namespace' 'lax'
    case 87768:                     // 'processing-instruction' 'lax'
    case 90194:                     // 'attribute' 'loop'
    case 90233:                     // 'element' 'loop'
    case 90296:                     // 'namespace' 'loop'
    case 90328:                     // 'processing-instruction' 'loop'
    case 93266:                     // 'attribute' 'module'
    case 93305:                     // 'element' 'module'
    case 93368:                     // 'namespace' 'module'
    case 93400:                     // 'processing-instruction' 'module'
    case 94290:                     // 'attribute' 'namespace'
    case 94329:                     // 'element' 'namespace'
    case 94392:                     // 'namespace' 'namespace'
    case 94424:                     // 'processing-instruction' 'namespace'
    case 94802:                     // 'attribute' 'namespace-node'
    case 94841:                     // 'element' 'namespace-node'
    case 94904:                     // 'namespace' 'namespace-node'
    case 94936:                     // 'processing-instruction' 'namespace-node'
    case 97874:                     // 'attribute' 'node'
    case 97913:                     // 'element' 'node'
    case 97976:                     // 'namespace' 'node'
    case 98008:                     // 'processing-instruction' 'node'
    case 98386:                     // 'attribute' 'nodes'
    case 98425:                     // 'element' 'nodes'
    case 98488:                     // 'namespace' 'nodes'
    case 98520:                     // 'processing-instruction' 'nodes'
    case 101970:                    // 'attribute' 'option'
    case 102009:                    // 'element' 'option'
    case 102072:                    // 'namespace' 'option'
    case 102104:                    // 'processing-instruction' 'option'
    case 103506:                    // 'attribute' 'ordered'
    case 103545:                    // 'element' 'ordered'
    case 103608:                    // 'namespace' 'ordered'
    case 103640:                    // 'processing-instruction' 'ordered'
    case 104018:                    // 'attribute' 'ordering'
    case 104057:                    // 'element' 'ordering'
    case 104120:                    // 'namespace' 'ordering'
    case 104152:                    // 'processing-instruction' 'ordering'
    case 105554:                    // 'attribute' 'parent'
    case 105593:                    // 'element' 'parent'
    case 105656:                    // 'namespace' 'parent'
    case 105688:                    // 'processing-instruction' 'parent'
    case 108626:                    // 'attribute' 'preceding'
    case 108665:                    // 'element' 'preceding'
    case 108728:                    // 'namespace' 'preceding'
    case 108760:                    // 'processing-instruction' 'preceding'
    case 109138:                    // 'attribute' 'preceding-sibling'
    case 109177:                    // 'element' 'preceding-sibling'
    case 109240:                    // 'namespace' 'preceding-sibling'
    case 109272:                    // 'processing-instruction' 'preceding-sibling'
    case 110674:                    // 'attribute' 'processing-instruction'
    case 110713:                    // 'element' 'processing-instruction'
    case 110776:                    // 'namespace' 'processing-instruction'
    case 110808:                    // 'processing-instruction' 'processing-instruction'
    case 111698:                    // 'attribute' 'rename'
    case 111737:                    // 'element' 'rename'
    case 111800:                    // 'namespace' 'rename'
    case 111832:                    // 'processing-instruction' 'rename'
    case 112210:                    // 'attribute' 'replace'
    case 112249:                    // 'element' 'replace'
    case 112312:                    // 'namespace' 'replace'
    case 112344:                    // 'processing-instruction' 'replace'
    case 113234:                    // 'attribute' 'returning'
    case 113273:                    // 'element' 'returning'
    case 113336:                    // 'namespace' 'returning'
    case 113368:                    // 'processing-instruction' 'returning'
    case 113746:                    // 'attribute' 'revalidation'
    case 113785:                    // 'element' 'revalidation'
    case 113848:                    // 'namespace' 'revalidation'
    case 113880:                    // 'processing-instruction' 'revalidation'
    case 115282:                    // 'attribute' 'schema'
    case 115321:                    // 'element' 'schema'
    case 115384:                    // 'namespace' 'schema'
    case 115416:                    // 'processing-instruction' 'schema'
    case 115794:                    // 'attribute' 'schema-attribute'
    case 115833:                    // 'element' 'schema-attribute'
    case 115896:                    // 'namespace' 'schema-attribute'
    case 115928:                    // 'processing-instruction' 'schema-attribute'
    case 116306:                    // 'attribute' 'schema-element'
    case 116345:                    // 'element' 'schema-element'
    case 116408:                    // 'namespace' 'schema-element'
    case 116440:                    // 'processing-instruction' 'schema-element'
    case 116818:                    // 'attribute' 'score'
    case 116857:                    // 'element' 'score'
    case 116920:                    // 'namespace' 'score'
    case 116952:                    // 'processing-instruction' 'score'
    case 117330:                    // 'attribute' 'self'
    case 117369:                    // 'element' 'self'
    case 117432:                    // 'namespace' 'self'
    case 117464:                    // 'processing-instruction' 'self'
    case 119890:                    // 'attribute' 'sliding'
    case 119929:                    // 'element' 'sliding'
    case 119992:                    // 'namespace' 'sliding'
    case 120024:                    // 'processing-instruction' 'sliding'
    case 120402:                    // 'attribute' 'some'
    case 120441:                    // 'element' 'some'
    case 120504:                    // 'namespace' 'some'
    case 120536:                    // 'processing-instruction' 'some'
    case 122962:                    // 'attribute' 'strict'
    case 123001:                    // 'element' 'strict'
    case 123064:                    // 'namespace' 'strict'
    case 123096:                    // 'processing-instruction' 'strict'
    case 124498:                    // 'attribute' 'switch'
    case 124537:                    // 'element' 'switch'
    case 124600:                    // 'namespace' 'switch'
    case 124632:                    // 'processing-instruction' 'switch'
    case 125010:                    // 'attribute' 'text'
    case 125049:                    // 'element' 'text'
    case 125112:                    // 'namespace' 'text'
    case 125144:                    // 'processing-instruction' 'text'
    case 128082:                    // 'attribute' 'try'
    case 128121:                    // 'element' 'try'
    case 128184:                    // 'namespace' 'try'
    case 128216:                    // 'processing-instruction' 'try'
    case 128594:                    // 'attribute' 'tumbling'
    case 128633:                    // 'element' 'tumbling'
    case 128696:                    // 'namespace' 'tumbling'
    case 128728:                    // 'processing-instruction' 'tumbling'
    case 129106:                    // 'attribute' 'type'
    case 129145:                    // 'element' 'type'
    case 129208:                    // 'namespace' 'type'
    case 129240:                    // 'processing-instruction' 'type'
    case 129618:                    // 'attribute' 'typeswitch'
    case 129657:                    // 'element' 'typeswitch'
    case 129720:                    // 'namespace' 'typeswitch'
    case 129752:                    // 'processing-instruction' 'typeswitch'
    case 131154:                    // 'attribute' 'unordered'
    case 131193:                    // 'element' 'unordered'
    case 131256:                    // 'namespace' 'unordered'
    case 131288:                    // 'processing-instruction' 'unordered'
    case 131666:                    // 'attribute' 'updating'
    case 131705:                    // 'element' 'updating'
    case 131768:                    // 'namespace' 'updating'
    case 131800:                    // 'processing-instruction' 'updating'
    case 133202:                    // 'attribute' 'validate'
    case 133241:                    // 'element' 'validate'
    case 133304:                    // 'namespace' 'validate'
    case 133336:                    // 'processing-instruction' 'validate'
    case 133714:                    // 'attribute' 'value'
    case 133753:                    // 'element' 'value'
    case 133816:                    // 'namespace' 'value'
    case 133848:                    // 'processing-instruction' 'value'
    case 134226:                    // 'attribute' 'variable'
    case 134265:                    // 'element' 'variable'
    case 134328:                    // 'namespace' 'variable'
    case 134360:                    // 'processing-instruction' 'variable'
    case 134738:                    // 'attribute' 'version'
    case 134777:                    // 'element' 'version'
    case 134840:                    // 'namespace' 'version'
    case 134872:                    // 'processing-instruction' 'version'
    case 136786:                    // 'attribute' 'while'
    case 136825:                    // 'element' 'while'
    case 136888:                    // 'namespace' 'while'
    case 136920:                    // 'processing-instruction' 'while'
    case 140370:                    // 'attribute' 'xquery'
    case 140409:                    // 'element' 'xquery'
    case 140472:                    // 'namespace' 'xquery'
    case 140504:                    // 'processing-instruction' 'xquery'
    case 141394:                    // 'attribute' '{'
    case 141408:                    // 'comment' '{'
    case 141431:                    // 'document' '{'
    case 141433:                    // 'element' '{'
    case 141496:                    // 'namespace' '{'
    case 141514:                    // 'ordered' '{'
    case 141528:                    // 'processing-instruction' '{'
    case 141556:                    // 'text' '{'
    case 141568:                    // 'unordered' '{'
      try_PostfixExpr();
      break;
    default:
      try_AxisStep();
    }
  }

  function parse_AxisStep()
  {
    eventHandler.startNonterminal("AxisStep", e0);
    switch (l1)
    {
    case 73:                        // 'ancestor'
    case 74:                        // 'ancestor-or-self'
    case 206:                       // 'parent'
    case 212:                       // 'preceding'
    case 213:                       // 'preceding-sibling'
      lookahead2W(240);             // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 45:                        // '..'
    case 26185:                     // 'ancestor' '::'
    case 26186:                     // 'ancestor-or-self' '::'
    case 26318:                     // 'parent' '::'
    case 26324:                     // 'preceding' '::'
    case 26325:                     // 'preceding-sibling' '::'
      parse_ReverseStep();
      break;
    default:
      parse_ForwardStep();
    }
    lookahead1W(236);               // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
    whitespace();
    parse_PredicateList();
    eventHandler.endNonterminal("AxisStep", e0);
  }

  function try_AxisStep()
  {
    switch (l1)
    {
    case 73:                        // 'ancestor'
    case 74:                        // 'ancestor-or-self'
    case 206:                       // 'parent'
    case 212:                       // 'preceding'
    case 213:                       // 'preceding-sibling'
      lookahead2W(240);             // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 45:                        // '..'
    case 26185:                     // 'ancestor' '::'
    case 26186:                     // 'ancestor-or-self' '::'
    case 26318:                     // 'parent' '::'
    case 26324:                     // 'preceding' '::'
    case 26325:                     // 'preceding-sibling' '::'
      try_ReverseStep();
      break;
    default:
      try_ForwardStep();
    }
    lookahead1W(236);               // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
    try_PredicateList();
  }

  function parse_ForwardStep()
  {
    eventHandler.startNonterminal("ForwardStep", e0);
    switch (l1)
    {
    case 82:                        // 'attribute'
      lookahead2W(243);             // S^WS | EOF | '!' | '!=' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    case 93:                        // 'child'
    case 111:                       // 'descendant'
    case 112:                       // 'descendant-or-self'
    case 135:                       // 'following'
    case 136:                       // 'following-sibling'
    case 229:                       // 'self'
      lookahead2W(240);             // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 26194:                     // 'attribute' '::'
    case 26205:                     // 'child' '::'
    case 26223:                     // 'descendant' '::'
    case 26224:                     // 'descendant-or-self' '::'
    case 26247:                     // 'following' '::'
    case 26248:                     // 'following-sibling' '::'
    case 26341:                     // 'self' '::'
      parse_ForwardAxis();
      lookahead1W(251);             // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_NodeTest();
      break;
    default:
      parse_AbbrevForwardStep();
    }
    eventHandler.endNonterminal("ForwardStep", e0);
  }

  function try_ForwardStep()
  {
    switch (l1)
    {
    case 82:                        // 'attribute'
      lookahead2W(243);             // S^WS | EOF | '!' | '!=' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    case 93:                        // 'child'
    case 111:                       // 'descendant'
    case 112:                       // 'descendant-or-self'
    case 135:                       // 'following'
    case 136:                       // 'following-sibling'
    case 229:                       // 'self'
      lookahead2W(240);             // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 26194:                     // 'attribute' '::'
    case 26205:                     // 'child' '::'
    case 26223:                     // 'descendant' '::'
    case 26224:                     // 'descendant-or-self' '::'
    case 26247:                     // 'following' '::'
    case 26248:                     // 'following-sibling' '::'
    case 26341:                     // 'self' '::'
      try_ForwardAxis();
      lookahead1W(251);             // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_NodeTest();
      break;
    default:
      try_AbbrevForwardStep();
    }
  }

  function parse_ForwardAxis()
  {
    eventHandler.startNonterminal("ForwardAxis", e0);
    switch (l1)
    {
    case 93:                        // 'child'
      shift(93);                    // 'child'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 111:                       // 'descendant'
      shift(111);                   // 'descendant'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 82:                        // 'attribute'
      shift(82);                    // 'attribute'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 229:                       // 'self'
      shift(229);                   // 'self'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 112:                       // 'descendant-or-self'
      shift(112);                   // 'descendant-or-self'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 136:                       // 'following-sibling'
      shift(136);                   // 'following-sibling'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    default:
      shift(135);                   // 'following'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
    }
    eventHandler.endNonterminal("ForwardAxis", e0);
  }

  function try_ForwardAxis()
  {
    switch (l1)
    {
    case 93:                        // 'child'
      shiftT(93);                   // 'child'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 111:                       // 'descendant'
      shiftT(111);                  // 'descendant'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 82:                        // 'attribute'
      shiftT(82);                   // 'attribute'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 229:                       // 'self'
      shiftT(229);                  // 'self'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 112:                       // 'descendant-or-self'
      shiftT(112);                  // 'descendant-or-self'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 136:                       // 'following-sibling'
      shiftT(136);                  // 'following-sibling'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    default:
      shiftT(135);                  // 'following'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
    }
  }

  function parse_AbbrevForwardStep()
  {
    eventHandler.startNonterminal("AbbrevForwardStep", e0);
    if (l1 == 66)                   // '@'
    {
      shift(66);                    // '@'
    }
    lookahead1W(251);               // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_NodeTest();
    eventHandler.endNonterminal("AbbrevForwardStep", e0);
  }

  function try_AbbrevForwardStep()
  {
    if (l1 == 66)                   // '@'
    {
      shiftT(66);                   // '@'
    }
    lookahead1W(251);               // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_NodeTest();
  }

  function parse_ReverseStep()
  {
    eventHandler.startNonterminal("ReverseStep", e0);
    switch (l1)
    {
    case 45:                        // '..'
      parse_AbbrevReverseStep();
      break;
    default:
      parse_ReverseAxis();
      lookahead1W(251);             // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_NodeTest();
    }
    eventHandler.endNonterminal("ReverseStep", e0);
  }

  function try_ReverseStep()
  {
    switch (l1)
    {
    case 45:                        // '..'
      try_AbbrevReverseStep();
      break;
    default:
      try_ReverseAxis();
      lookahead1W(251);             // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_NodeTest();
    }
  }

  function parse_ReverseAxis()
  {
    eventHandler.startNonterminal("ReverseAxis", e0);
    switch (l1)
    {
    case 206:                       // 'parent'
      shift(206);                   // 'parent'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 73:                        // 'ancestor'
      shift(73);                    // 'ancestor'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 213:                       // 'preceding-sibling'
      shift(213);                   // 'preceding-sibling'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    case 212:                       // 'preceding'
      shift(212);                   // 'preceding'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
      break;
    default:
      shift(74);                    // 'ancestor-or-self'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shift(51);                    // '::'
    }
    eventHandler.endNonterminal("ReverseAxis", e0);
  }

  function try_ReverseAxis()
  {
    switch (l1)
    {
    case 206:                       // 'parent'
      shiftT(206);                  // 'parent'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 73:                        // 'ancestor'
      shiftT(73);                   // 'ancestor'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 213:                       // 'preceding-sibling'
      shiftT(213);                  // 'preceding-sibling'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    case 212:                       // 'preceding'
      shiftT(212);                  // 'preceding'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
      break;
    default:
      shiftT(74);                   // 'ancestor-or-self'
      lookahead1W(26);              // S^WS | '(:' | '::'
      shiftT(51);                   // '::'
    }
  }

  function parse_AbbrevReverseStep()
  {
    eventHandler.startNonterminal("AbbrevReverseStep", e0);
    shift(45);                      // '..'
    eventHandler.endNonterminal("AbbrevReverseStep", e0);
  }

  function try_AbbrevReverseStep()
  {
    shiftT(45);                     // '..'
  }

  function parse_NodeTest()
  {
    eventHandler.startNonterminal("NodeTest", e0);
    switch (l1)
    {
    case 82:                        // 'attribute'
    case 96:                        // 'comment'
    case 120:                       // 'document-node'
    case 121:                       // 'element'
    case 185:                       // 'namespace-node'
    case 191:                       // 'node'
    case 216:                       // 'processing-instruction'
    case 226:                       // 'schema-attribute'
    case 227:                       // 'schema-element'
    case 244:                       // 'text'
      lookahead2W(239);             // S^WS | EOF | '!' | '!=' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 17490:                     // 'attribute' '('
    case 17504:                     // 'comment' '('
    case 17528:                     // 'document-node' '('
    case 17529:                     // 'element' '('
    case 17593:                     // 'namespace-node' '('
    case 17599:                     // 'node' '('
    case 17624:                     // 'processing-instruction' '('
    case 17634:                     // 'schema-attribute' '('
    case 17635:                     // 'schema-element' '('
    case 17652:                     // 'text' '('
      parse_KindTest();
      break;
    default:
      parse_NameTest();
    }
    eventHandler.endNonterminal("NodeTest", e0);
  }

  function try_NodeTest()
  {
    switch (l1)
    {
    case 82:                        // 'attribute'
    case 96:                        // 'comment'
    case 120:                       // 'document-node'
    case 121:                       // 'element'
    case 185:                       // 'namespace-node'
    case 191:                       // 'node'
    case 216:                       // 'processing-instruction'
    case 226:                       // 'schema-attribute'
    case 227:                       // 'schema-element'
    case 244:                       // 'text'
      lookahead2W(239);             // S^WS | EOF | '!' | '!=' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 17490:                     // 'attribute' '('
    case 17504:                     // 'comment' '('
    case 17528:                     // 'document-node' '('
    case 17529:                     // 'element' '('
    case 17593:                     // 'namespace-node' '('
    case 17599:                     // 'node' '('
    case 17624:                     // 'processing-instruction' '('
    case 17634:                     // 'schema-attribute' '('
    case 17635:                     // 'schema-element' '('
    case 17652:                     // 'text' '('
      try_KindTest();
      break;
    default:
      try_NameTest();
    }
  }

  function parse_NameTest()
  {
    eventHandler.startNonterminal("NameTest", e0);
    switch (l1)
    {
    case 5:                         // Wildcard
      shift(5);                     // Wildcard
      break;
    default:
      parse_EQName();
    }
    eventHandler.endNonterminal("NameTest", e0);
  }

  function try_NameTest()
  {
    switch (l1)
    {
    case 5:                         // Wildcard
      shiftT(5);                    // Wildcard
      break;
    default:
      try_EQName();
    }
  }

  function parse_PostfixExpr()
  {
    eventHandler.startNonterminal("PostfixExpr", e0);
    parse_PrimaryExpr();
    for (;;)
    {
      lookahead1W(239);             // S^WS | EOF | '!' | '!=' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      if (l1 != 34                  // '('
       && l1 != 68)                 // '['
      {
        break;
      }
      switch (l1)
      {
      case 68:                      // '['
        whitespace();
        parse_Predicate();
        break;
      default:
        whitespace();
        parse_ArgumentList();
      }
    }
    eventHandler.endNonterminal("PostfixExpr", e0);
  }

  function try_PostfixExpr()
  {
    try_PrimaryExpr();
    for (;;)
    {
      lookahead1W(239);             // S^WS | EOF | '!' | '!=' | '(' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' |
      if (l1 != 34                  // '('
       && l1 != 68)                 // '['
      {
        break;
      }
      switch (l1)
      {
      case 68:                      // '['
        try_Predicate();
        break;
      default:
        try_ArgumentList();
      }
    }
  }

  function parse_ArgumentList()
  {
    eventHandler.startNonterminal("ArgumentList", e0);
    shift(34);                      // '('
    lookahead1W(274);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 37)                   // ')'
    {
      whitespace();
      parse_Argument();
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shift(41);                  // ','
        lookahead1W(269);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        whitespace();
        parse_Argument();
      }
    }
    shift(37);                      // ')'
    eventHandler.endNonterminal("ArgumentList", e0);
  }

  function try_ArgumentList()
  {
    shiftT(34);                     // '('
    lookahead1W(274);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 37)                   // ')'
    {
      try_Argument();
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shiftT(41);                 // ','
        lookahead1W(269);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        try_Argument();
      }
    }
    shiftT(37);                     // ')'
  }

  function parse_PredicateList()
  {
    eventHandler.startNonterminal("PredicateList", e0);
    for (;;)
    {
      lookahead1W(236);             // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
      if (l1 != 68)                 // '['
      {
        break;
      }
      whitespace();
      parse_Predicate();
    }
    eventHandler.endNonterminal("PredicateList", e0);
  }

  function try_PredicateList()
  {
    for (;;)
    {
      lookahead1W(236);             // S^WS | EOF | '!' | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | '/' | '//' | ':' |
      if (l1 != 68)                 // '['
      {
        break;
      }
      try_Predicate();
    }
  }

  function parse_Predicate()
  {
    eventHandler.startNonterminal("Predicate", e0);
    shift(68);                      // '['
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(69);                      // ']'
    eventHandler.endNonterminal("Predicate", e0);
  }

  function try_Predicate()
  {
    shiftT(68);                     // '['
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(69);                     // ']'
  }

  function parse_Literal()
  {
    eventHandler.startNonterminal("Literal", e0);
    switch (l1)
    {
    case 11:                        // StringLiteral
      shift(11);                    // StringLiteral
      break;
    default:
      parse_NumericLiteral();
    }
    eventHandler.endNonterminal("Literal", e0);
  }

  function try_Literal()
  {
    switch (l1)
    {
    case 11:                        // StringLiteral
      shiftT(11);                   // StringLiteral
      break;
    default:
      try_NumericLiteral();
    }
  }

  function parse_NumericLiteral()
  {
    eventHandler.startNonterminal("NumericLiteral", e0);
    switch (l1)
    {
    case 8:                         // IntegerLiteral
      shift(8);                     // IntegerLiteral
      break;
    case 9:                         // DecimalLiteral
      shift(9);                     // DecimalLiteral
      break;
    default:
      shift(10);                    // DoubleLiteral
    }
    eventHandler.endNonterminal("NumericLiteral", e0);
  }

  function try_NumericLiteral()
  {
    switch (l1)
    {
    case 8:                         // IntegerLiteral
      shiftT(8);                    // IntegerLiteral
      break;
    case 9:                         // DecimalLiteral
      shiftT(9);                    // DecimalLiteral
      break;
    default:
      shiftT(10);                   // DoubleLiteral
    }
  }

  function parse_VarRef()
  {
    eventHandler.startNonterminal("VarRef", e0);
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    eventHandler.endNonterminal("VarRef", e0);
  }

  function try_VarRef()
  {
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
  }

  function parse_VarName()
  {
    eventHandler.startNonterminal("VarName", e0);
    parse_EQName();
    eventHandler.endNonterminal("VarName", e0);
  }

  function try_VarName()
  {
    try_EQName();
  }

  function parse_ParenthesizedExpr()
  {
    eventHandler.startNonterminal("ParenthesizedExpr", e0);
    shift(34);                      // '('
    lookahead1W(268);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 37)                   // ')'
    {
      whitespace();
      parse_Expr();
    }
    shift(37);                      // ')'
    eventHandler.endNonterminal("ParenthesizedExpr", e0);
  }

  function try_ParenthesizedExpr()
  {
    shiftT(34);                     // '('
    lookahead1W(268);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 37)                   // ')'
    {
      try_Expr();
    }
    shiftT(37);                     // ')'
  }

  function parse_ContextItemExpr()
  {
    eventHandler.startNonterminal("ContextItemExpr", e0);
    shift(44);                      // '.'
    eventHandler.endNonterminal("ContextItemExpr", e0);
  }

  function try_ContextItemExpr()
  {
    shiftT(44);                     // '.'
  }

  function parse_OrderedExpr()
  {
    eventHandler.startNonterminal("OrderedExpr", e0);
    shift(202);                     // 'ordered'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("OrderedExpr", e0);
  }

  function try_OrderedExpr()
  {
    shiftT(202);                    // 'ordered'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(282);                    // '}'
  }

  function parse_UnorderedExpr()
  {
    eventHandler.startNonterminal("UnorderedExpr", e0);
    shift(256);                     // 'unordered'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("UnorderedExpr", e0);
  }

  function try_UnorderedExpr()
  {
    shiftT(256);                    // 'unordered'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(282);                    // '}'
  }

  function parse_FunctionCall()
  {
    eventHandler.startNonterminal("FunctionCall", e0);
    parse_FunctionName();
    lookahead1W(22);                // S^WS | '(' | '(:'
    whitespace();
    parse_ArgumentList();
    eventHandler.endNonterminal("FunctionCall", e0);
  }

  function try_FunctionCall()
  {
    try_FunctionName();
    lookahead1W(22);                // S^WS | '(' | '(:'
    try_ArgumentList();
  }

  function parse_Argument()
  {
    eventHandler.startNonterminal("Argument", e0);
    switch (l1)
    {
    case 64:                        // '?'
      parse_ArgumentPlaceholder();
      break;
    default:
      parse_ExprSingle();
    }
    eventHandler.endNonterminal("Argument", e0);
  }

  function try_Argument()
  {
    switch (l1)
    {
    case 64:                        // '?'
      try_ArgumentPlaceholder();
      break;
    default:
      try_ExprSingle();
    }
  }

  function parse_ArgumentPlaceholder()
  {
    eventHandler.startNonterminal("ArgumentPlaceholder", e0);
    shift(64);                      // '?'
    eventHandler.endNonterminal("ArgumentPlaceholder", e0);
  }

  function try_ArgumentPlaceholder()
  {
    shiftT(64);                     // '?'
  }

  function parse_Constructor()
  {
    eventHandler.startNonterminal("Constructor", e0);
    switch (l1)
    {
    case 54:                        // '<'
    case 55:                        // '<!--'
    case 59:                        // '<?'
      parse_DirectConstructor();
      break;
    default:
      parse_ComputedConstructor();
    }
    eventHandler.endNonterminal("Constructor", e0);
  }

  function try_Constructor()
  {
    switch (l1)
    {
    case 54:                        // '<'
    case 55:                        // '<!--'
    case 59:                        // '<?'
      try_DirectConstructor();
      break;
    default:
      try_ComputedConstructor();
    }
  }

  function parse_DirectConstructor()
  {
    eventHandler.startNonterminal("DirectConstructor", e0);
    switch (l1)
    {
    case 54:                        // '<'
      parse_DirElemConstructor();
      break;
    case 55:                        // '<!--'
      parse_DirCommentConstructor();
      break;
    default:
      parse_DirPIConstructor();
    }
    eventHandler.endNonterminal("DirectConstructor", e0);
  }

  function try_DirectConstructor()
  {
    switch (l1)
    {
    case 54:                        // '<'
      try_DirElemConstructor();
      break;
    case 55:                        // '<!--'
      try_DirCommentConstructor();
      break;
    default:
      try_DirPIConstructor();
    }
  }

  function parse_DirElemConstructor()
  {
    eventHandler.startNonterminal("DirElemConstructor", e0);
    shift(54);                      // '<'
    lookahead1(4);                  // QName
    shift(20);                      // QName
    parse_DirAttributeList();
    switch (l1)
    {
    case 48:                        // '/>'
      shift(48);                    // '/>'
      break;
    default:
      shift(61);                    // '>'
      for (;;)
      {
        lookahead1(174);            // CDataSection | PredefinedEntityRef | ElementContentChar | CharRef | '<' |
        if (l1 == 56)               // '</'
        {
          break;
        }
        parse_DirElemContent();
      }
      shift(56);                    // '</'
      lookahead1(4);                // QName
      shift(20);                    // QName
      lookahead1(12);               // S | '>'
      if (l1 == 21)                 // S
      {
        shift(21);                  // S
      }
      lookahead1(8);                // '>'
      shift(61);                    // '>'
    }
    eventHandler.endNonterminal("DirElemConstructor", e0);
  }

  function try_DirElemConstructor()
  {
    shiftT(54);                     // '<'
    lookahead1(4);                  // QName
    shiftT(20);                     // QName
    try_DirAttributeList();
    switch (l1)
    {
    case 48:                        // '/>'
      shiftT(48);                   // '/>'
      break;
    default:
      shiftT(61);                   // '>'
      for (;;)
      {
        lookahead1(174);            // CDataSection | PredefinedEntityRef | ElementContentChar | CharRef | '<' |
        if (l1 == 56)               // '</'
        {
          break;
        }
        try_DirElemContent();
      }
      shiftT(56);                   // '</'
      lookahead1(4);                // QName
      shiftT(20);                   // QName
      lookahead1(12);               // S | '>'
      if (l1 == 21)                 // S
      {
        shiftT(21);                 // S
      }
      lookahead1(8);                // '>'
      shiftT(61);                   // '>'
    }
  }

  function parse_DirAttributeList()
  {
    eventHandler.startNonterminal("DirAttributeList", e0);
    for (;;)
    {
      lookahead1(19);               // S | '/>' | '>'
      if (l1 != 21)                 // S
      {
        break;
      }
      shift(21);                    // S
      lookahead1(91);               // QName | S | '/>' | '>'
      if (l1 == 20)                 // QName
      {
        shift(20);                  // QName
        lookahead1(11);             // S | '='
        if (l1 == 21)               // S
        {
          shift(21);                // S
        }
        lookahead1(7);              // '='
        shift(60);                  // '='
        lookahead1(18);             // S | '"' | "'"
        if (l1 == 21)               // S
        {
          shift(21);                // S
        }
        parse_DirAttributeValue();
      }
    }
    eventHandler.endNonterminal("DirAttributeList", e0);
  }

  function try_DirAttributeList()
  {
    for (;;)
    {
      lookahead1(19);               // S | '/>' | '>'
      if (l1 != 21)                 // S
      {
        break;
      }
      shiftT(21);                   // S
      lookahead1(91);               // QName | S | '/>' | '>'
      if (l1 == 20)                 // QName
      {
        shiftT(20);                 // QName
        lookahead1(11);             // S | '='
        if (l1 == 21)               // S
        {
          shiftT(21);               // S
        }
        lookahead1(7);              // '='
        shiftT(60);                 // '='
        lookahead1(18);             // S | '"' | "'"
        if (l1 == 21)               // S
        {
          shiftT(21);               // S
        }
        try_DirAttributeValue();
      }
    }
  }

  function parse_DirAttributeValue()
  {
    eventHandler.startNonterminal("DirAttributeValue", e0);
    lookahead1(14);                 // '"' | "'"
    switch (l1)
    {
    case 28:                        // '"'
      shift(28);                    // '"'
      for (;;)
      {
        lookahead1(167);            // PredefinedEntityRef | EscapeQuot | QuotAttrContentChar | CharRef | '"' | '{' |
        if (l1 == 28)               // '"'
        {
          break;
        }
        switch (l1)
        {
        case 13:                    // EscapeQuot
          shift(13);                // EscapeQuot
          break;
        default:
          parse_QuotAttrValueContent();
        }
      }
      shift(28);                    // '"'
      break;
    default:
      shift(33);                    // "'"
      for (;;)
      {
        lookahead1(168);            // PredefinedEntityRef | EscapeApos | AposAttrContentChar | CharRef | "'" | '{' |
        if (l1 == 33)               // "'"
        {
          break;
        }
        switch (l1)
        {
        case 14:                    // EscapeApos
          shift(14);                // EscapeApos
          break;
        default:
          parse_AposAttrValueContent();
        }
      }
      shift(33);                    // "'"
    }
    eventHandler.endNonterminal("DirAttributeValue", e0);
  }

  function try_DirAttributeValue()
  {
    lookahead1(14);                 // '"' | "'"
    switch (l1)
    {
    case 28:                        // '"'
      shiftT(28);                   // '"'
      for (;;)
      {
        lookahead1(167);            // PredefinedEntityRef | EscapeQuot | QuotAttrContentChar | CharRef | '"' | '{' |
        if (l1 == 28)               // '"'
        {
          break;
        }
        switch (l1)
        {
        case 13:                    // EscapeQuot
          shiftT(13);               // EscapeQuot
          break;
        default:
          try_QuotAttrValueContent();
        }
      }
      shiftT(28);                   // '"'
      break;
    default:
      shiftT(33);                   // "'"
      for (;;)
      {
        lookahead1(168);            // PredefinedEntityRef | EscapeApos | AposAttrContentChar | CharRef | "'" | '{' |
        if (l1 == 33)               // "'"
        {
          break;
        }
        switch (l1)
        {
        case 14:                    // EscapeApos
          shiftT(14);               // EscapeApos
          break;
        default:
          try_AposAttrValueContent();
        }
      }
      shiftT(33);                   // "'"
    }
  }

  function parse_QuotAttrValueContent()
  {
    eventHandler.startNonterminal("QuotAttrValueContent", e0);
    switch (l1)
    {
    case 16:                        // QuotAttrContentChar
      shift(16);                    // QuotAttrContentChar
      break;
    default:
      parse_CommonContent();
    }
    eventHandler.endNonterminal("QuotAttrValueContent", e0);
  }

  function try_QuotAttrValueContent()
  {
    switch (l1)
    {
    case 16:                        // QuotAttrContentChar
      shiftT(16);                   // QuotAttrContentChar
      break;
    default:
      try_CommonContent();
    }
  }

  function parse_AposAttrValueContent()
  {
    eventHandler.startNonterminal("AposAttrValueContent", e0);
    switch (l1)
    {
    case 17:                        // AposAttrContentChar
      shift(17);                    // AposAttrContentChar
      break;
    default:
      parse_CommonContent();
    }
    eventHandler.endNonterminal("AposAttrValueContent", e0);
  }

  function try_AposAttrValueContent()
  {
    switch (l1)
    {
    case 17:                        // AposAttrContentChar
      shiftT(17);                   // AposAttrContentChar
      break;
    default:
      try_CommonContent();
    }
  }

  function parse_DirElemContent()
  {
    eventHandler.startNonterminal("DirElemContent", e0);
    switch (l1)
    {
    case 54:                        // '<'
    case 55:                        // '<!--'
    case 59:                        // '<?'
      parse_DirectConstructor();
      break;
    case 4:                         // CDataSection
      shift(4);                     // CDataSection
      break;
    case 15:                        // ElementContentChar
      shift(15);                    // ElementContentChar
      break;
    default:
      parse_CommonContent();
    }
    eventHandler.endNonterminal("DirElemContent", e0);
  }

  function try_DirElemContent()
  {
    switch (l1)
    {
    case 54:                        // '<'
    case 55:                        // '<!--'
    case 59:                        // '<?'
      try_DirectConstructor();
      break;
    case 4:                         // CDataSection
      shiftT(4);                    // CDataSection
      break;
    case 15:                        // ElementContentChar
      shiftT(15);                   // ElementContentChar
      break;
    default:
      try_CommonContent();
    }
  }

  function parse_DirCommentConstructor()
  {
    eventHandler.startNonterminal("DirCommentConstructor", e0);
    shift(55);                      // '<!--'
    lookahead1(1);                  // DirCommentContents
    shift(2);                       // DirCommentContents
    lookahead1(6);                  // '-->'
    shift(43);                      // '-->'
    eventHandler.endNonterminal("DirCommentConstructor", e0);
  }

  function try_DirCommentConstructor()
  {
    shiftT(55);                     // '<!--'
    lookahead1(1);                  // DirCommentContents
    shiftT(2);                      // DirCommentContents
    lookahead1(6);                  // '-->'
    shiftT(43);                     // '-->'
  }

  function parse_DirPIConstructor()
  {
    eventHandler.startNonterminal("DirPIConstructor", e0);
    shift(59);                      // '<?'
    lookahead1(3);                  // PITarget
    shift(18);                      // PITarget
    lookahead1(13);                 // S | '?>'
    if (l1 == 21)                   // S
    {
      shift(21);                    // S
      lookahead1(2);                // DirPIContents
      shift(3);                     // DirPIContents
    }
    lookahead1(9);                  // '?>'
    shift(65);                      // '?>'
    eventHandler.endNonterminal("DirPIConstructor", e0);
  }

  function try_DirPIConstructor()
  {
    shiftT(59);                     // '<?'
    lookahead1(3);                  // PITarget
    shiftT(18);                     // PITarget
    lookahead1(13);                 // S | '?>'
    if (l1 == 21)                   // S
    {
      shiftT(21);                   // S
      lookahead1(2);                // DirPIContents
      shiftT(3);                    // DirPIContents
    }
    lookahead1(9);                  // '?>'
    shiftT(65);                     // '?>'
  }

  function parse_ComputedConstructor()
  {
    eventHandler.startNonterminal("ComputedConstructor", e0);
    switch (l1)
    {
    case 119:                       // 'document'
      parse_CompDocConstructor();
      break;
    case 121:                       // 'element'
      parse_CompElemConstructor();
      break;
    case 82:                        // 'attribute'
      parse_CompAttrConstructor();
      break;
    case 184:                       // 'namespace'
      parse_CompNamespaceConstructor();
      break;
    case 244:                       // 'text'
      parse_CompTextConstructor();
      break;
    case 96:                        // 'comment'
      parse_CompCommentConstructor();
      break;
    default:
      parse_CompPIConstructor();
    }
    eventHandler.endNonterminal("ComputedConstructor", e0);
  }

  function try_ComputedConstructor()
  {
    switch (l1)
    {
    case 119:                       // 'document'
      try_CompDocConstructor();
      break;
    case 121:                       // 'element'
      try_CompElemConstructor();
      break;
    case 82:                        // 'attribute'
      try_CompAttrConstructor();
      break;
    case 184:                       // 'namespace'
      try_CompNamespaceConstructor();
      break;
    case 244:                       // 'text'
      try_CompTextConstructor();
      break;
    case 96:                        // 'comment'
      try_CompCommentConstructor();
      break;
    default:
      try_CompPIConstructor();
    }
  }

  function parse_CompElemConstructor()
  {
    eventHandler.startNonterminal("CompElemConstructor", e0);
    shift(121);                     // 'element'
    lookahead1W(252);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    switch (l1)
    {
    case 276:                       // '{'
      shift(276);                   // '{'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_Expr();
      shift(282);                   // '}'
      break;
    default:
      whitespace();
      parse_EQName();
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(272);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 282)                  // '}'
    {
      whitespace();
      parse_ContentExpr();
    }
    shift(282);                     // '}'
    eventHandler.endNonterminal("CompElemConstructor", e0);
  }

  function try_CompElemConstructor()
  {
    shiftT(121);                    // 'element'
    lookahead1W(252);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    switch (l1)
    {
    case 276:                       // '{'
      shiftT(276);                  // '{'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_Expr();
      shiftT(282);                  // '}'
      break;
    default:
      try_EQName();
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(272);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    if (l1 != 282)                  // '}'
    {
      try_ContentExpr();
    }
    shiftT(282);                    // '}'
  }

  function parse_CompNamespaceConstructor()
  {
    eventHandler.startNonterminal("CompNamespaceConstructor", e0);
    shift(184);                     // 'namespace'
    lookahead1W(253);               // NCName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    switch (l1)
    {
    case 276:                       // '{'
      shift(276);                   // '{'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_PrefixExpr();
      shift(282);                   // '}'
      break;
    default:
      whitespace();
      parse_Prefix();
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_URIExpr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("CompNamespaceConstructor", e0);
  }

  function try_CompNamespaceConstructor()
  {
    shiftT(184);                    // 'namespace'
    lookahead1W(253);               // NCName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    switch (l1)
    {
    case 276:                       // '{'
      shiftT(276);                  // '{'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_PrefixExpr();
      shiftT(282);                  // '}'
      break;
    default:
      try_Prefix();
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_URIExpr();
    shiftT(282);                    // '}'
  }

  function parse_Prefix()
  {
    eventHandler.startNonterminal("Prefix", e0);
    parse_NCName();
    eventHandler.endNonterminal("Prefix", e0);
  }

  function try_Prefix()
  {
    try_NCName();
  }

  function parse_PrefixExpr()
  {
    eventHandler.startNonterminal("PrefixExpr", e0);
    parse_Expr();
    eventHandler.endNonterminal("PrefixExpr", e0);
  }

  function try_PrefixExpr()
  {
    try_Expr();
  }

  function parse_URIExpr()
  {
    eventHandler.startNonterminal("URIExpr", e0);
    parse_Expr();
    eventHandler.endNonterminal("URIExpr", e0);
  }

  function try_URIExpr()
  {
    try_Expr();
  }

  function parse_FunctionItemExpr()
  {
    eventHandler.startNonterminal("FunctionItemExpr", e0);
    switch (l1)
    {
    case 145:                       // 'function'
      lookahead2W(92);              // S^WS | '#' | '(' | '(:'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 32:                        // '%'
    case 17553:                     // 'function' '('
      parse_InlineFunctionExpr();
      break;
    default:
      parse_NamedFunctionRef();
    }
    eventHandler.endNonterminal("FunctionItemExpr", e0);
  }

  function try_FunctionItemExpr()
  {
    switch (l1)
    {
    case 145:                       // 'function'
      lookahead2W(92);              // S^WS | '#' | '(' | '(:'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 32:                        // '%'
    case 17553:                     // 'function' '('
      try_InlineFunctionExpr();
      break;
    default:
      try_NamedFunctionRef();
    }
  }

  function parse_NamedFunctionRef()
  {
    eventHandler.startNonterminal("NamedFunctionRef", e0);
    parse_EQName();
    lookahead1W(20);                // S^WS | '#' | '(:'
    shift(29);                      // '#'
    lookahead1W(16);                // IntegerLiteral | S^WS | '(:'
    shift(8);                       // IntegerLiteral
    eventHandler.endNonterminal("NamedFunctionRef", e0);
  }

  function try_NamedFunctionRef()
  {
    try_EQName();
    lookahead1W(20);                // S^WS | '#' | '(:'
    shiftT(29);                     // '#'
    lookahead1W(16);                // IntegerLiteral | S^WS | '(:'
    shiftT(8);                      // IntegerLiteral
  }

  function parse_InlineFunctionExpr()
  {
    eventHandler.startNonterminal("InlineFunctionExpr", e0);
    for (;;)
    {
      lookahead1W(97);              // S^WS | '%' | '(:' | 'function'
      if (l1 != 32)                 // '%'
      {
        break;
      }
      whitespace();
      parse_Annotation();
    }
    shift(145);                     // 'function'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(94);                // S^WS | '$' | '(:' | ')'
    if (l1 == 31)                   // '$'
    {
      whitespace();
      parse_ParamList();
    }
    shift(37);                      // ')'
    lookahead1W(111);               // S^WS | '(:' | 'as' | '{'
    if (l1 == 79)                   // 'as'
    {
      shift(79);                    // 'as'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_SequenceType();
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    whitespace();
    parse_FunctionBody();
    eventHandler.endNonterminal("InlineFunctionExpr", e0);
  }

  function try_InlineFunctionExpr()
  {
    for (;;)
    {
      lookahead1W(97);              // S^WS | '%' | '(:' | 'function'
      if (l1 != 32)                 // '%'
      {
        break;
      }
      try_Annotation();
    }
    shiftT(145);                    // 'function'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(94);                // S^WS | '$' | '(:' | ')'
    if (l1 == 31)                   // '$'
    {
      try_ParamList();
    }
    shiftT(37);                     // ')'
    lookahead1W(111);               // S^WS | '(:' | 'as' | '{'
    if (l1 == 79)                   // 'as'
    {
      shiftT(79);                   // 'as'
      lookahead1W(259);             // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_SequenceType();
    }
    lookahead1W(87);                // S^WS | '(:' | '{'
    try_FunctionBody();
  }

  function parse_SingleType()
  {
    eventHandler.startNonterminal("SingleType", e0);
    parse_SimpleTypeName();
    lookahead1W(226);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 64)                   // '?'
    {
      shift(64);                    // '?'
    }
    eventHandler.endNonterminal("SingleType", e0);
  }

  function try_SingleType()
  {
    try_SimpleTypeName();
    lookahead1W(226);               // S^WS | EOF | '!=' | '(:' | ')' | '*' | '+' | ',' | '-' | ':' | ';' | '<' | '<<' |
    if (l1 == 64)                   // '?'
    {
      shiftT(64);                   // '?'
    }
  }

  function parse_TypeDeclaration()
  {
    eventHandler.startNonterminal("TypeDeclaration", e0);
    shift(79);                      // 'as'
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_SequenceType();
    eventHandler.endNonterminal("TypeDeclaration", e0);
  }

  function try_TypeDeclaration()
  {
    shiftT(79);                     // 'as'
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_SequenceType();
  }

  function parse_SequenceType()
  {
    eventHandler.startNonterminal("SequenceType", e0);
    switch (l1)
    {
    case 124:                       // 'empty-sequence'
      lookahead2W(241);             // S^WS | EOF | '!=' | '(' | '(:' | ')' | '*' | '*' | '+' | ',' | '-' | ':' | ':=' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 17532:                     // 'empty-sequence' '('
      shift(124);                   // 'empty-sequence'
      lookahead1W(22);              // S^WS | '(' | '(:'
      shift(34);                    // '('
      lookahead1W(23);              // S^WS | '(:' | ')'
      shift(37);                    // ')'
      break;
    default:
      parse_ItemType();
      lookahead1W(237);             // S^WS | EOF | '!=' | '(:' | ')' | '*' | '*' | '+' | ',' | '-' | ':' | ':=' | ';' |
      switch (l1)
      {
      case 39:                      // '*'
      case 40:                      // '+'
      case 64:                      // '?'
        whitespace();
        parse_OccurrenceIndicator();
        break;
      default:
        break;
      }
    }
    eventHandler.endNonterminal("SequenceType", e0);
  }

  function try_SequenceType()
  {
    switch (l1)
    {
    case 124:                       // 'empty-sequence'
      lookahead2W(241);             // S^WS | EOF | '!=' | '(' | '(:' | ')' | '*' | '*' | '+' | ',' | '-' | ':' | ':=' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 17532:                     // 'empty-sequence' '('
      shiftT(124);                  // 'empty-sequence'
      lookahead1W(22);              // S^WS | '(' | '(:'
      shiftT(34);                   // '('
      lookahead1W(23);              // S^WS | '(:' | ')'
      shiftT(37);                   // ')'
      break;
    default:
      try_ItemType();
      lookahead1W(237);             // S^WS | EOF | '!=' | '(:' | ')' | '*' | '*' | '+' | ',' | '-' | ':' | ':=' | ';' |
      switch (l1)
      {
      case 39:                      // '*'
      case 40:                      // '+'
      case 64:                      // '?'
        try_OccurrenceIndicator();
        break;
      default:
        break;
      }
    }
  }

  function parse_OccurrenceIndicator()
  {
    eventHandler.startNonterminal("OccurrenceIndicator", e0);
    switch (l1)
    {
    case 64:                        // '?'
      shift(64);                    // '?'
      break;
    case 39:                        // '*'
      shift(39);                    // '*'
      break;
    default:
      shift(40);                    // '+'
    }
    eventHandler.endNonterminal("OccurrenceIndicator", e0);
  }

  function try_OccurrenceIndicator()
  {
    switch (l1)
    {
    case 64:                        // '?'
      shiftT(64);                   // '?'
      break;
    case 39:                        // '*'
      shiftT(39);                   // '*'
      break;
    default:
      shiftT(40);                   // '+'
    }
  }

  function parse_ItemType()
  {
    eventHandler.startNonterminal("ItemType", e0);
    switch (l1)
    {
    case 82:                        // 'attribute'
    case 96:                        // 'comment'
    case 120:                       // 'document-node'
    case 121:                       // 'element'
    case 145:                       // 'function'
    case 165:                       // 'item'
    case 185:                       // 'namespace-node'
    case 191:                       // 'node'
    case 216:                       // 'processing-instruction'
    case 226:                       // 'schema-attribute'
    case 227:                       // 'schema-element'
    case 244:                       // 'text'
      lookahead2W(241);             // S^WS | EOF | '!=' | '(' | '(:' | ')' | '*' | '*' | '+' | ',' | '-' | ':' | ':=' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 17490:                     // 'attribute' '('
    case 17504:                     // 'comment' '('
    case 17528:                     // 'document-node' '('
    case 17529:                     // 'element' '('
    case 17593:                     // 'namespace-node' '('
    case 17599:                     // 'node' '('
    case 17624:                     // 'processing-instruction' '('
    case 17634:                     // 'schema-attribute' '('
    case 17635:                     // 'schema-element' '('
    case 17652:                     // 'text' '('
      parse_KindTest();
      break;
    case 17573:                     // 'item' '('
      shift(165);                   // 'item'
      lookahead1W(22);              // S^WS | '(' | '(:'
      shift(34);                    // '('
      lookahead1W(23);              // S^WS | '(:' | ')'
      shift(37);                    // ')'
      break;
    case 32:                        // '%'
    case 17553:                     // 'function' '('
      parse_FunctionTest();
      break;
    case 34:                        // '('
      parse_ParenthesizedItemType();
      break;
    case 78:                        // 'array'
    case 167:                       // 'json-item'
    case 194:                       // 'object'
      parse_JSONTest();
      break;
    case 242:                       // 'structured-item'
      parse_StructuredItemTest();
      break;
    default:
      parse_AtomicOrUnionType();
    }
    eventHandler.endNonterminal("ItemType", e0);
  }

  function try_ItemType()
  {
    switch (l1)
    {
    case 82:                        // 'attribute'
    case 96:                        // 'comment'
    case 120:                       // 'document-node'
    case 121:                       // 'element'
    case 145:                       // 'function'
    case 165:                       // 'item'
    case 185:                       // 'namespace-node'
    case 191:                       // 'node'
    case 216:                       // 'processing-instruction'
    case 226:                       // 'schema-attribute'
    case 227:                       // 'schema-element'
    case 244:                       // 'text'
      lookahead2W(241);             // S^WS | EOF | '!=' | '(' | '(:' | ')' | '*' | '*' | '+' | ',' | '-' | ':' | ':=' |
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 17490:                     // 'attribute' '('
    case 17504:                     // 'comment' '('
    case 17528:                     // 'document-node' '('
    case 17529:                     // 'element' '('
    case 17593:                     // 'namespace-node' '('
    case 17599:                     // 'node' '('
    case 17624:                     // 'processing-instruction' '('
    case 17634:                     // 'schema-attribute' '('
    case 17635:                     // 'schema-element' '('
    case 17652:                     // 'text' '('
      try_KindTest();
      break;
    case 17573:                     // 'item' '('
      shiftT(165);                  // 'item'
      lookahead1W(22);              // S^WS | '(' | '(:'
      shiftT(34);                   // '('
      lookahead1W(23);              // S^WS | '(:' | ')'
      shiftT(37);                   // ')'
      break;
    case 32:                        // '%'
    case 17553:                     // 'function' '('
      try_FunctionTest();
      break;
    case 34:                        // '('
      try_ParenthesizedItemType();
      break;
    case 78:                        // 'array'
    case 167:                       // 'json-item'
    case 194:                       // 'object'
      try_JSONTest();
      break;
    case 242:                       // 'structured-item'
      try_StructuredItemTest();
      break;
    default:
      try_AtomicOrUnionType();
    }
  }

  function parse_JSONTest()
  {
    eventHandler.startNonterminal("JSONTest", e0);
    switch (l1)
    {
    case 167:                       // 'json-item'
      parse_JSONItemTest();
      break;
    case 194:                       // 'object'
      parse_JSONObjectTest();
      break;
    default:
      parse_JSONArrayTest();
    }
    eventHandler.endNonterminal("JSONTest", e0);
  }

  function try_JSONTest()
  {
    switch (l1)
    {
    case 167:                       // 'json-item'
      try_JSONItemTest();
      break;
    case 194:                       // 'object'
      try_JSONObjectTest();
      break;
    default:
      try_JSONArrayTest();
    }
  }

  function parse_StructuredItemTest()
  {
    eventHandler.startNonterminal("StructuredItemTest", e0);
    shift(242);                     // 'structured-item'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("StructuredItemTest", e0);
  }

  function try_StructuredItemTest()
  {
    shiftT(242);                    // 'structured-item'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_JSONItemTest()
  {
    eventHandler.startNonterminal("JSONItemTest", e0);
    shift(167);                     // 'json-item'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("JSONItemTest", e0);
  }

  function try_JSONItemTest()
  {
    shiftT(167);                    // 'json-item'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_JSONObjectTest()
  {
    eventHandler.startNonterminal("JSONObjectTest", e0);
    shift(194);                     // 'object'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("JSONObjectTest", e0);
  }

  function try_JSONObjectTest()
  {
    shiftT(194);                    // 'object'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_JSONArrayTest()
  {
    eventHandler.startNonterminal("JSONArrayTest", e0);
    shift(78);                      // 'array'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("JSONArrayTest", e0);
  }

  function try_JSONArrayTest()
  {
    shiftT(78);                     // 'array'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_AtomicOrUnionType()
  {
    eventHandler.startNonterminal("AtomicOrUnionType", e0);
    parse_EQName();
    eventHandler.endNonterminal("AtomicOrUnionType", e0);
  }

  function try_AtomicOrUnionType()
  {
    try_EQName();
  }

  function parse_KindTest()
  {
    eventHandler.startNonterminal("KindTest", e0);
    switch (l1)
    {
    case 120:                       // 'document-node'
      parse_DocumentTest();
      break;
    case 121:                       // 'element'
      parse_ElementTest();
      break;
    case 82:                        // 'attribute'
      parse_AttributeTest();
      break;
    case 227:                       // 'schema-element'
      parse_SchemaElementTest();
      break;
    case 226:                       // 'schema-attribute'
      parse_SchemaAttributeTest();
      break;
    case 216:                       // 'processing-instruction'
      parse_PITest();
      break;
    case 96:                        // 'comment'
      parse_CommentTest();
      break;
    case 244:                       // 'text'
      parse_TextTest();
      break;
    case 185:                       // 'namespace-node'
      parse_NamespaceNodeTest();
      break;
    default:
      parse_AnyKindTest();
    }
    eventHandler.endNonterminal("KindTest", e0);
  }

  function try_KindTest()
  {
    switch (l1)
    {
    case 120:                       // 'document-node'
      try_DocumentTest();
      break;
    case 121:                       // 'element'
      try_ElementTest();
      break;
    case 82:                        // 'attribute'
      try_AttributeTest();
      break;
    case 227:                       // 'schema-element'
      try_SchemaElementTest();
      break;
    case 226:                       // 'schema-attribute'
      try_SchemaAttributeTest();
      break;
    case 216:                       // 'processing-instruction'
      try_PITest();
      break;
    case 96:                        // 'comment'
      try_CommentTest();
      break;
    case 244:                       // 'text'
      try_TextTest();
      break;
    case 185:                       // 'namespace-node'
      try_NamespaceNodeTest();
      break;
    default:
      try_AnyKindTest();
    }
  }

  function parse_AnyKindTest()
  {
    eventHandler.startNonterminal("AnyKindTest", e0);
    shift(191);                     // 'node'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("AnyKindTest", e0);
  }

  function try_AnyKindTest()
  {
    shiftT(191);                    // 'node'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_DocumentTest()
  {
    eventHandler.startNonterminal("DocumentTest", e0);
    shift(120);                     // 'document-node'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(144);               // S^WS | '(:' | ')' | 'element' | 'schema-element'
    if (l1 != 37)                   // ')'
    {
      switch (l1)
      {
      case 121:                     // 'element'
        whitespace();
        parse_ElementTest();
        break;
      default:
        whitespace();
        parse_SchemaElementTest();
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("DocumentTest", e0);
  }

  function try_DocumentTest()
  {
    shiftT(120);                    // 'document-node'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(144);               // S^WS | '(:' | ')' | 'element' | 'schema-element'
    if (l1 != 37)                   // ')'
    {
      switch (l1)
      {
      case 121:                     // 'element'
        try_ElementTest();
        break;
      default:
        try_SchemaElementTest();
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_TextTest()
  {
    eventHandler.startNonterminal("TextTest", e0);
    shift(244);                     // 'text'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("TextTest", e0);
  }

  function try_TextTest()
  {
    shiftT(244);                    // 'text'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_CommentTest()
  {
    eventHandler.startNonterminal("CommentTest", e0);
    shift(96);                      // 'comment'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("CommentTest", e0);
  }

  function try_CommentTest()
  {
    shiftT(96);                     // 'comment'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_NamespaceNodeTest()
  {
    eventHandler.startNonterminal("NamespaceNodeTest", e0);
    shift(185);                     // 'namespace-node'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("NamespaceNodeTest", e0);
  }

  function try_NamespaceNodeTest()
  {
    shiftT(185);                    // 'namespace-node'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_PITest()
  {
    eventHandler.startNonterminal("PITest", e0);
    shift(216);                     // 'processing-instruction'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(256);               // StringLiteral | NCName^Token | S^WS | '(:' | ')' | 'after' | 'allowing' |
    if (l1 != 37)                   // ')'
    {
      switch (l1)
      {
      case 11:                      // StringLiteral
        shift(11);                  // StringLiteral
        break;
      default:
        whitespace();
        parse_NCName();
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("PITest", e0);
  }

  function try_PITest()
  {
    shiftT(216);                    // 'processing-instruction'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(256);               // StringLiteral | NCName^Token | S^WS | '(:' | ')' | 'after' | 'allowing' |
    if (l1 != 37)                   // ')'
    {
      switch (l1)
      {
      case 11:                      // StringLiteral
        shiftT(11);                 // StringLiteral
        break;
      default:
        try_NCName();
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_AttributeTest()
  {
    eventHandler.startNonterminal("AttributeTest", e0);
    shift(82);                      // 'attribute'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(255);               // EQName^Token | S^WS | '(:' | ')' | '*' | 'after' | 'allowing' | 'ancestor' |
    if (l1 != 37)                   // ')'
    {
      whitespace();
      parse_AttribNameOrWildcard();
      lookahead1W(101);             // S^WS | '(:' | ')' | ','
      if (l1 == 41)                 // ','
      {
        shift(41);                  // ','
        lookahead1W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        whitespace();
        parse_TypeName();
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("AttributeTest", e0);
  }

  function try_AttributeTest()
  {
    shiftT(82);                     // 'attribute'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(255);               // EQName^Token | S^WS | '(:' | ')' | '*' | 'after' | 'allowing' | 'ancestor' |
    if (l1 != 37)                   // ')'
    {
      try_AttribNameOrWildcard();
      lookahead1W(101);             // S^WS | '(:' | ')' | ','
      if (l1 == 41)                 // ','
      {
        shiftT(41);                 // ','
        lookahead1W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        try_TypeName();
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_AttribNameOrWildcard()
  {
    eventHandler.startNonterminal("AttribNameOrWildcard", e0);
    switch (l1)
    {
    case 38:                        // '*'
      shift(38);                    // '*'
      break;
    default:
      parse_AttributeName();
    }
    eventHandler.endNonterminal("AttribNameOrWildcard", e0);
  }

  function try_AttribNameOrWildcard()
  {
    switch (l1)
    {
    case 38:                        // '*'
      shiftT(38);                   // '*'
      break;
    default:
      try_AttributeName();
    }
  }

  function parse_SchemaAttributeTest()
  {
    eventHandler.startNonterminal("SchemaAttributeTest", e0);
    shift(226);                     // 'schema-attribute'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_AttributeDeclaration();
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("SchemaAttributeTest", e0);
  }

  function try_SchemaAttributeTest()
  {
    shiftT(226);                    // 'schema-attribute'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_AttributeDeclaration();
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_AttributeDeclaration()
  {
    eventHandler.startNonterminal("AttributeDeclaration", e0);
    parse_AttributeName();
    eventHandler.endNonterminal("AttributeDeclaration", e0);
  }

  function try_AttributeDeclaration()
  {
    try_AttributeName();
  }

  function parse_ElementTest()
  {
    eventHandler.startNonterminal("ElementTest", e0);
    shift(121);                     // 'element'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(255);               // EQName^Token | S^WS | '(:' | ')' | '*' | 'after' | 'allowing' | 'ancestor' |
    if (l1 != 37)                   // ')'
    {
      whitespace();
      parse_ElementNameOrWildcard();
      lookahead1W(101);             // S^WS | '(:' | ')' | ','
      if (l1 == 41)                 // ','
      {
        shift(41);                  // ','
        lookahead1W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        whitespace();
        parse_TypeName();
        lookahead1W(102);           // S^WS | '(:' | ')' | '?'
        if (l1 == 64)               // '?'
        {
          shift(64);                // '?'
        }
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("ElementTest", e0);
  }

  function try_ElementTest()
  {
    shiftT(121);                    // 'element'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(255);               // EQName^Token | S^WS | '(:' | ')' | '*' | 'after' | 'allowing' | 'ancestor' |
    if (l1 != 37)                   // ')'
    {
      try_ElementNameOrWildcard();
      lookahead1W(101);             // S^WS | '(:' | ')' | ','
      if (l1 == 41)                 // ','
      {
        shiftT(41);                 // ','
        lookahead1W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        try_TypeName();
        lookahead1W(102);           // S^WS | '(:' | ')' | '?'
        if (l1 == 64)               // '?'
        {
          shiftT(64);               // '?'
        }
      }
    }
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_ElementNameOrWildcard()
  {
    eventHandler.startNonterminal("ElementNameOrWildcard", e0);
    switch (l1)
    {
    case 38:                        // '*'
      shift(38);                    // '*'
      break;
    default:
      parse_ElementName();
    }
    eventHandler.endNonterminal("ElementNameOrWildcard", e0);
  }

  function try_ElementNameOrWildcard()
  {
    switch (l1)
    {
    case 38:                        // '*'
      shiftT(38);                   // '*'
      break;
    default:
      try_ElementName();
    }
  }

  function parse_SchemaElementTest()
  {
    eventHandler.startNonterminal("SchemaElementTest", e0);
    shift(227);                     // 'schema-element'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_ElementDeclaration();
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("SchemaElementTest", e0);
  }

  function try_SchemaElementTest()
  {
    shiftT(227);                    // 'schema-element'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_ElementDeclaration();
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_ElementDeclaration()
  {
    eventHandler.startNonterminal("ElementDeclaration", e0);
    parse_ElementName();
    eventHandler.endNonterminal("ElementDeclaration", e0);
  }

  function try_ElementDeclaration()
  {
    try_ElementName();
  }

  function parse_AttributeName()
  {
    eventHandler.startNonterminal("AttributeName", e0);
    parse_EQName();
    eventHandler.endNonterminal("AttributeName", e0);
  }

  function try_AttributeName()
  {
    try_EQName();
  }

  function parse_ElementName()
  {
    eventHandler.startNonterminal("ElementName", e0);
    parse_EQName();
    eventHandler.endNonterminal("ElementName", e0);
  }

  function try_ElementName()
  {
    try_EQName();
  }

  function parse_SimpleTypeName()
  {
    eventHandler.startNonterminal("SimpleTypeName", e0);
    parse_TypeName();
    eventHandler.endNonterminal("SimpleTypeName", e0);
  }

  function try_SimpleTypeName()
  {
    try_TypeName();
  }

  function parse_TypeName()
  {
    eventHandler.startNonterminal("TypeName", e0);
    parse_EQName();
    eventHandler.endNonterminal("TypeName", e0);
  }

  function try_TypeName()
  {
    try_EQName();
  }

  function parse_FunctionTest()
  {
    eventHandler.startNonterminal("FunctionTest", e0);
    for (;;)
    {
      lookahead1W(97);              // S^WS | '%' | '(:' | 'function'
      if (l1 != 32)                 // '%'
      {
        break;
      }
      whitespace();
      parse_Annotation();
    }
    switch (l1)
    {
    case 145:                       // 'function'
      lookahead2W(22);              // S^WS | '(' | '(:'
      break;
    default:
      lk = l1;
    }
    lk = memoized(4, e0);
    if (lk == 0)
    {
      var b0A = b0; var e0A = e0; var l1A = l1;
      var b1A = b1; var e1A = e1; var l2A = l2;
      var b2A = b2; var e2A = e2;
      try
      {
        try_AnyFunctionTest();
        lk = -1;
      }
      catch (p1A)
      {
        lk = -2;
      }
      b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
      b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
      b2 = b2A; e2 = e2A; end = e2A; }}
      memoize(4, e0, lk);
    }
    switch (lk)
    {
    case -1:
      whitespace();
      parse_AnyFunctionTest();
      break;
    default:
      whitespace();
      parse_TypedFunctionTest();
    }
    eventHandler.endNonterminal("FunctionTest", e0);
  }

  function try_FunctionTest()
  {
    for (;;)
    {
      lookahead1W(97);              // S^WS | '%' | '(:' | 'function'
      if (l1 != 32)                 // '%'
      {
        break;
      }
      try_Annotation();
    }
    switch (l1)
    {
    case 145:                       // 'function'
      lookahead2W(22);              // S^WS | '(' | '(:'
      break;
    default:
      lk = l1;
    }
    lk = memoized(4, e0);
    if (lk == 0)
    {
      var b0A = b0; var e0A = e0; var l1A = l1;
      var b1A = b1; var e1A = e1; var l2A = l2;
      var b2A = b2; var e2A = e2;
      try
      {
        try_AnyFunctionTest();
        lk = -1;
      }
      catch (p1A)
      {
        lk = -2;
      }
      b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
      b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
      b2 = b2A; e2 = e2A; end = e2A; }}
      memoize(4, e0, lk);
    }
    switch (lk)
    {
    case -1:
      try_AnyFunctionTest();
      break;
    default:
      try_TypedFunctionTest();
    }
  }

  function parse_AnyFunctionTest()
  {
    eventHandler.startNonterminal("AnyFunctionTest", e0);
    shift(145);                     // 'function'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(24);                // S^WS | '(:' | '*'
    shift(38);                      // '*'
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("AnyFunctionTest", e0);
  }

  function try_AnyFunctionTest()
  {
    shiftT(145);                    // 'function'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(24);                // S^WS | '(:' | '*'
    shiftT(38);                     // '*'
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_TypedFunctionTest()
  {
    eventHandler.startNonterminal("TypedFunctionTest", e0);
    shift(145);                     // 'function'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shift(34);                      // '('
    lookahead1W(261);               // EQName^Token | S^WS | '%' | '(' | '(:' | ')' | 'after' | 'allowing' |
    if (l1 != 37)                   // ')'
    {
      whitespace();
      parse_SequenceType();
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shift(41);                  // ','
        lookahead1W(259);           // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
        whitespace();
        parse_SequenceType();
      }
    }
    shift(37);                      // ')'
    lookahead1W(30);                // S^WS | '(:' | 'as'
    shift(79);                      // 'as'
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_SequenceType();
    eventHandler.endNonterminal("TypedFunctionTest", e0);
  }

  function try_TypedFunctionTest()
  {
    shiftT(145);                    // 'function'
    lookahead1W(22);                // S^WS | '(' | '(:'
    shiftT(34);                     // '('
    lookahead1W(261);               // EQName^Token | S^WS | '%' | '(' | '(:' | ')' | 'after' | 'allowing' |
    if (l1 != 37)                   // ')'
    {
      try_SequenceType();
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shiftT(41);                 // ','
        lookahead1W(259);           // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
        try_SequenceType();
      }
    }
    shiftT(37);                     // ')'
    lookahead1W(30);                // S^WS | '(:' | 'as'
    shiftT(79);                     // 'as'
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_SequenceType();
  }

  function parse_ParenthesizedItemType()
  {
    eventHandler.startNonterminal("ParenthesizedItemType", e0);
    shift(34);                      // '('
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_ItemType();
    lookahead1W(23);                // S^WS | '(:' | ')'
    shift(37);                      // ')'
    eventHandler.endNonterminal("ParenthesizedItemType", e0);
  }

  function try_ParenthesizedItemType()
  {
    shiftT(34);                     // '('
    lookahead1W(259);               // EQName^Token | S^WS | '%' | '(' | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_ItemType();
    lookahead1W(23);                // S^WS | '(:' | ')'
    shiftT(37);                     // ')'
  }

  function parse_RevalidationDecl()
  {
    eventHandler.startNonterminal("RevalidationDecl", e0);
    shift(108);                     // 'declare'
    lookahead1W(72);                // S^WS | '(:' | 'revalidation'
    shift(222);                     // 'revalidation'
    lookahead1W(152);               // S^WS | '(:' | 'lax' | 'skip' | 'strict'
    switch (l1)
    {
    case 240:                       // 'strict'
      shift(240);                   // 'strict'
      break;
    case 171:                       // 'lax'
      shift(171);                   // 'lax'
      break;
    default:
      shift(233);                   // 'skip'
    }
    eventHandler.endNonterminal("RevalidationDecl", e0);
  }

  function parse_InsertExprTargetChoice()
  {
    eventHandler.startNonterminal("InsertExprTargetChoice", e0);
    switch (l1)
    {
    case 70:                        // 'after'
      shift(70);                    // 'after'
      break;
    case 84:                        // 'before'
      shift(84);                    // 'before'
      break;
    default:
      if (l1 == 79)                 // 'as'
      {
        shift(79);                  // 'as'
        lookahead1W(119);           // S^WS | '(:' | 'first' | 'last'
        switch (l1)
        {
        case 134:                   // 'first'
          shift(134);               // 'first'
          break;
        default:
          shift(170);               // 'last'
        }
      }
      lookahead1W(54);              // S^WS | '(:' | 'into'
      shift(163);                   // 'into'
    }
    eventHandler.endNonterminal("InsertExprTargetChoice", e0);
  }

  function try_InsertExprTargetChoice()
  {
    switch (l1)
    {
    case 70:                        // 'after'
      shiftT(70);                   // 'after'
      break;
    case 84:                        // 'before'
      shiftT(84);                   // 'before'
      break;
    default:
      if (l1 == 79)                 // 'as'
      {
        shiftT(79);                 // 'as'
        lookahead1W(119);           // S^WS | '(:' | 'first' | 'last'
        switch (l1)
        {
        case 134:                   // 'first'
          shiftT(134);              // 'first'
          break;
        default:
          shiftT(170);              // 'last'
        }
      }
      lookahead1W(54);              // S^WS | '(:' | 'into'
      shiftT(163);                  // 'into'
    }
  }

  function parse_InsertExpr()
  {
    eventHandler.startNonterminal("InsertExpr", e0);
    shift(159);                     // 'insert'
    lookahead1W(129);               // S^WS | '(:' | 'node' | 'nodes'
    switch (l1)
    {
    case 191:                       // 'node'
      shift(191);                   // 'node'
      break;
    default:
      shift(192);                   // 'nodes'
    }
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_SourceExpr();
    whitespace();
    parse_InsertExprTargetChoice();
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_TargetExpr();
    eventHandler.endNonterminal("InsertExpr", e0);
  }

  function try_InsertExpr()
  {
    shiftT(159);                    // 'insert'
    lookahead1W(129);               // S^WS | '(:' | 'node' | 'nodes'
    switch (l1)
    {
    case 191:                       // 'node'
      shiftT(191);                  // 'node'
      break;
    default:
      shiftT(192);                  // 'nodes'
    }
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_SourceExpr();
    try_InsertExprTargetChoice();
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_TargetExpr();
  }

  function parse_DeleteExpr()
  {
    eventHandler.startNonterminal("DeleteExpr", e0);
    shift(110);                     // 'delete'
    lookahead1W(129);               // S^WS | '(:' | 'node' | 'nodes'
    switch (l1)
    {
    case 191:                       // 'node'
      shift(191);                   // 'node'
      break;
    default:
      shift(192);                   // 'nodes'
    }
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_TargetExpr();
    eventHandler.endNonterminal("DeleteExpr", e0);
  }

  function try_DeleteExpr()
  {
    shiftT(110);                    // 'delete'
    lookahead1W(129);               // S^WS | '(:' | 'node' | 'nodes'
    switch (l1)
    {
    case 191:                       // 'node'
      shiftT(191);                  // 'node'
      break;
    default:
      shiftT(192);                  // 'nodes'
    }
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_TargetExpr();
  }

  function parse_ReplaceExpr()
  {
    eventHandler.startNonterminal("ReplaceExpr", e0);
    shift(219);                     // 'replace'
    lookahead1W(130);               // S^WS | '(:' | 'node' | 'value'
    if (l1 == 261)                  // 'value'
    {
      shift(261);                   // 'value'
      lookahead1W(64);              // S^WS | '(:' | 'of'
      shift(196);                   // 'of'
    }
    lookahead1W(62);                // S^WS | '(:' | 'node'
    shift(191);                     // 'node'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_TargetExpr();
    shift(270);                     // 'with'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("ReplaceExpr", e0);
  }

  function try_ReplaceExpr()
  {
    shiftT(219);                    // 'replace'
    lookahead1W(130);               // S^WS | '(:' | 'node' | 'value'
    if (l1 == 261)                  // 'value'
    {
      shiftT(261);                  // 'value'
      lookahead1W(64);              // S^WS | '(:' | 'of'
      shiftT(196);                  // 'of'
    }
    lookahead1W(62);                // S^WS | '(:' | 'node'
    shiftT(191);                    // 'node'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_TargetExpr();
    shiftT(270);                    // 'with'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_RenameExpr()
  {
    eventHandler.startNonterminal("RenameExpr", e0);
    shift(218);                     // 'rename'
    lookahead1W(62);                // S^WS | '(:' | 'node'
    shift(191);                     // 'node'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_TargetExpr();
    shift(79);                      // 'as'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_NewNameExpr();
    eventHandler.endNonterminal("RenameExpr", e0);
  }

  function try_RenameExpr()
  {
    shiftT(218);                    // 'rename'
    lookahead1W(62);                // S^WS | '(:' | 'node'
    shiftT(191);                    // 'node'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_TargetExpr();
    shiftT(79);                     // 'as'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_NewNameExpr();
  }

  function parse_SourceExpr()
  {
    eventHandler.startNonterminal("SourceExpr", e0);
    parse_ExprSingle();
    eventHandler.endNonterminal("SourceExpr", e0);
  }

  function try_SourceExpr()
  {
    try_ExprSingle();
  }

  function parse_TargetExpr()
  {
    eventHandler.startNonterminal("TargetExpr", e0);
    parse_ExprSingle();
    eventHandler.endNonterminal("TargetExpr", e0);
  }

  function try_TargetExpr()
  {
    try_ExprSingle();
  }

  function parse_NewNameExpr()
  {
    eventHandler.startNonterminal("NewNameExpr", e0);
    parse_ExprSingle();
    eventHandler.endNonterminal("NewNameExpr", e0);
  }

  function try_NewNameExpr()
  {
    try_ExprSingle();
  }

  function parse_TransformExpr()
  {
    eventHandler.startNonterminal("TransformExpr", e0);
    shift(103);                     // 'copy'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shift(31);                      // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_VarName();
    lookahead1W(27);                // S^WS | '(:' | ':='
    shift(52);                      // ':='
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      shift(31);                    // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      whitespace();
      parse_VarName();
      lookahead1W(27);              // S^WS | '(:' | ':='
      shift(52);                    // ':='
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_ExprSingle();
    }
    shift(181);                     // 'modify'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    shift(220);                     // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("TransformExpr", e0);
  }

  function try_TransformExpr()
  {
    shiftT(103);                    // 'copy'
    lookahead1W(21);                // S^WS | '$' | '(:'
    shiftT(31);                     // '$'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_VarName();
    lookahead1W(27);                // S^WS | '(:' | ':='
    shiftT(52);                     // ':='
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
    for (;;)
    {
      if (l1 != 41)                 // ','
      {
        break;
      }
      shiftT(41);                   // ','
      lookahead1W(21);              // S^WS | '$' | '(:'
      shiftT(31);                   // '$'
      lookahead1W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      try_VarName();
      lookahead1W(27);              // S^WS | '(:' | ':='
      shiftT(52);                   // ':='
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_ExprSingle();
    }
    shiftT(181);                    // 'modify'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
    shiftT(220);                    // 'return'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_ExprSingle();
  }

  function parse_FTSelection()
  {
    eventHandler.startNonterminal("FTSelection", e0);
    parse_FTOr();
    for (;;)
    {
      lookahead1W(211);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      switch (l1)
      {
      case 81:                      // 'at'
        lookahead2W(151);           // S^WS | '(:' | 'end' | 'position' | 'start'
        break;
      default:
        lk = l1;
      }
      if (lk != 115                 // 'different'
       && lk != 117                 // 'distance'
       && lk != 127                 // 'entire'
       && lk != 202                 // 'ordered'
       && lk != 223                 // 'same'
       && lk != 269                 // 'window'
       && lk != 64593               // 'at' 'end'
       && lk != 121425)             // 'at' 'start'
      {
        break;
      }
      whitespace();
      parse_FTPosFilter();
    }
    eventHandler.endNonterminal("FTSelection", e0);
  }

  function try_FTSelection()
  {
    try_FTOr();
    for (;;)
    {
      lookahead1W(211);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      switch (l1)
      {
      case 81:                      // 'at'
        lookahead2W(151);           // S^WS | '(:' | 'end' | 'position' | 'start'
        break;
      default:
        lk = l1;
      }
      if (lk != 115                 // 'different'
       && lk != 117                 // 'distance'
       && lk != 127                 // 'entire'
       && lk != 202                 // 'ordered'
       && lk != 223                 // 'same'
       && lk != 269                 // 'window'
       && lk != 64593               // 'at' 'end'
       && lk != 121425)             // 'at' 'start'
      {
        break;
      }
      try_FTPosFilter();
    }
  }

  function parse_FTWeight()
  {
    eventHandler.startNonterminal("FTWeight", e0);
    shift(264);                     // 'weight'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shift(276);                     // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_Expr();
    shift(282);                     // '}'
    eventHandler.endNonterminal("FTWeight", e0);
  }

  function try_FTWeight()
  {
    shiftT(264);                    // 'weight'
    lookahead1W(87);                // S^WS | '(:' | '{'
    shiftT(276);                    // '{'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_Expr();
    shiftT(282);                    // '}'
  }

  function parse_FTOr()
  {
    eventHandler.startNonterminal("FTOr", e0);
    parse_FTAnd();
    for (;;)
    {
      if (l1 != 144)                // 'ftor'
      {
        break;
      }
      shift(144);                   // 'ftor'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      whitespace();
      parse_FTAnd();
    }
    eventHandler.endNonterminal("FTOr", e0);
  }

  function try_FTOr()
  {
    try_FTAnd();
    for (;;)
    {
      if (l1 != 144)                // 'ftor'
      {
        break;
      }
      shiftT(144);                  // 'ftor'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      try_FTAnd();
    }
  }

  function parse_FTAnd()
  {
    eventHandler.startNonterminal("FTAnd", e0);
    parse_FTMildNot();
    for (;;)
    {
      if (l1 != 142)                // 'ftand'
      {
        break;
      }
      shift(142);                   // 'ftand'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      whitespace();
      parse_FTMildNot();
    }
    eventHandler.endNonterminal("FTAnd", e0);
  }

  function try_FTAnd()
  {
    try_FTMildNot();
    for (;;)
    {
      if (l1 != 142)                // 'ftand'
      {
        break;
      }
      shiftT(142);                  // 'ftand'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      try_FTMildNot();
    }
  }

  function parse_FTMildNot()
  {
    eventHandler.startNonterminal("FTMildNot", e0);
    parse_FTUnaryNot();
    for (;;)
    {
      lookahead1W(212);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 != 193)                // 'not'
      {
        break;
      }
      shift(193);                   // 'not'
      lookahead1W(53);              // S^WS | '(:' | 'in'
      shift(154);                   // 'in'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      whitespace();
      parse_FTUnaryNot();
    }
    eventHandler.endNonterminal("FTMildNot", e0);
  }

  function try_FTMildNot()
  {
    try_FTUnaryNot();
    for (;;)
    {
      lookahead1W(212);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 != 193)                // 'not'
      {
        break;
      }
      shiftT(193);                  // 'not'
      lookahead1W(53);              // S^WS | '(:' | 'in'
      shiftT(154);                  // 'in'
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      try_FTUnaryNot();
    }
  }

  function parse_FTUnaryNot()
  {
    eventHandler.startNonterminal("FTUnaryNot", e0);
    if (l1 == 143)                  // 'ftnot'
    {
      shift(143);                   // 'ftnot'
    }
    lookahead1W(155);               // StringLiteral | S^WS | '(' | '(#' | '(:' | '{'
    whitespace();
    parse_FTPrimaryWithOptions();
    eventHandler.endNonterminal("FTUnaryNot", e0);
  }

  function try_FTUnaryNot()
  {
    if (l1 == 143)                  // 'ftnot'
    {
      shiftT(143);                  // 'ftnot'
    }
    lookahead1W(155);               // StringLiteral | S^WS | '(' | '(#' | '(:' | '{'
    try_FTPrimaryWithOptions();
  }

  function parse_FTPrimaryWithOptions()
  {
    eventHandler.startNonterminal("FTPrimaryWithOptions", e0);
    parse_FTPrimary();
    lookahead1W(214);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    if (l1 == 259)                  // 'using'
    {
      whitespace();
      parse_FTMatchOptions();
    }
    if (l1 == 264)                  // 'weight'
    {
      whitespace();
      parse_FTWeight();
    }
    eventHandler.endNonterminal("FTPrimaryWithOptions", e0);
  }

  function try_FTPrimaryWithOptions()
  {
    try_FTPrimary();
    lookahead1W(214);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    if (l1 == 259)                  // 'using'
    {
      try_FTMatchOptions();
    }
    if (l1 == 264)                  // 'weight'
    {
      try_FTWeight();
    }
  }

  function parse_FTPrimary()
  {
    eventHandler.startNonterminal("FTPrimary", e0);
    switch (l1)
    {
    case 34:                        // '('
      shift(34);                    // '('
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      whitespace();
      parse_FTSelection();
      shift(37);                    // ')'
      break;
    case 35:                        // '(#'
      parse_FTExtensionSelection();
      break;
    default:
      parse_FTWords();
      lookahead1W(215);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 == 195)                // 'occurs'
      {
        whitespace();
        parse_FTTimes();
      }
    }
    eventHandler.endNonterminal("FTPrimary", e0);
  }

  function try_FTPrimary()
  {
    switch (l1)
    {
    case 34:                        // '('
      shiftT(34);                   // '('
      lookahead1W(162);             // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{'
      try_FTSelection();
      shiftT(37);                   // ')'
      break;
    case 35:                        // '(#'
      try_FTExtensionSelection();
      break;
    default:
      try_FTWords();
      lookahead1W(215);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 == 195)                // 'occurs'
      {
        try_FTTimes();
      }
    }
  }

  function parse_FTWords()
  {
    eventHandler.startNonterminal("FTWords", e0);
    parse_FTWordsValue();
    lookahead1W(221);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    if (l1 == 71                    // 'all'
     || l1 == 76                    // 'any'
     || l1 == 210)                  // 'phrase'
    {
      whitespace();
      parse_FTAnyallOption();
    }
    eventHandler.endNonterminal("FTWords", e0);
  }

  function try_FTWords()
  {
    try_FTWordsValue();
    lookahead1W(221);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    if (l1 == 71                    // 'all'
     || l1 == 76                    // 'any'
     || l1 == 210)                  // 'phrase'
    {
      try_FTAnyallOption();
    }
  }

  function parse_FTWordsValue()
  {
    eventHandler.startNonterminal("FTWordsValue", e0);
    switch (l1)
    {
    case 11:                        // StringLiteral
      shift(11);                    // StringLiteral
      break;
    default:
      shift(276);                   // '{'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_Expr();
      shift(282);                   // '}'
    }
    eventHandler.endNonterminal("FTWordsValue", e0);
  }

  function try_FTWordsValue()
  {
    switch (l1)
    {
    case 11:                        // StringLiteral
      shiftT(11);                   // StringLiteral
      break;
    default:
      shiftT(276);                  // '{'
      lookahead1W(266);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_Expr();
      shiftT(282);                  // '}'
    }
  }

  function parse_FTExtensionSelection()
  {
    eventHandler.startNonterminal("FTExtensionSelection", e0);
    for (;;)
    {
      whitespace();
      parse_Pragma();
      lookahead1W(100);             // S^WS | '(#' | '(:' | '{'
      if (l1 != 35)                 // '(#'
      {
        break;
      }
    }
    shift(276);                     // '{'
    lookahead1W(166);               // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{' | '}'
    if (l1 != 282)                  // '}'
    {
      whitespace();
      parse_FTSelection();
    }
    shift(282);                     // '}'
    eventHandler.endNonterminal("FTExtensionSelection", e0);
  }

  function try_FTExtensionSelection()
  {
    for (;;)
    {
      try_Pragma();
      lookahead1W(100);             // S^WS | '(#' | '(:' | '{'
      if (l1 != 35)                 // '(#'
      {
        break;
      }
    }
    shiftT(276);                    // '{'
    lookahead1W(166);               // StringLiteral | S^WS | '(' | '(#' | '(:' | 'ftnot' | '{' | '}'
    if (l1 != 282)                  // '}'
    {
      try_FTSelection();
    }
    shiftT(282);                    // '}'
  }

  function parse_FTAnyallOption()
  {
    eventHandler.startNonterminal("FTAnyallOption", e0);
    switch (l1)
    {
    case 76:                        // 'any'
      shift(76);                    // 'any'
      lookahead1W(218);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 == 272)                // 'word'
      {
        shift(272);                 // 'word'
      }
      break;
    case 71:                        // 'all'
      shift(71);                    // 'all'
      lookahead1W(219);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 == 273)                // 'words'
      {
        shift(273);                 // 'words'
      }
      break;
    default:
      shift(210);                   // 'phrase'
    }
    eventHandler.endNonterminal("FTAnyallOption", e0);
  }

  function try_FTAnyallOption()
  {
    switch (l1)
    {
    case 76:                        // 'any'
      shiftT(76);                   // 'any'
      lookahead1W(218);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 == 272)                // 'word'
      {
        shiftT(272);                // 'word'
      }
      break;
    case 71:                        // 'all'
      shiftT(71);                   // 'all'
      lookahead1W(219);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 == 273)                // 'words'
      {
        shiftT(273);                // 'words'
      }
      break;
    default:
      shiftT(210);                  // 'phrase'
    }
  }

  function parse_FTTimes()
  {
    eventHandler.startNonterminal("FTTimes", e0);
    shift(195);                     // 'occurs'
    lookahead1W(149);               // S^WS | '(:' | 'at' | 'exactly' | 'from'
    whitespace();
    parse_FTRange();
    shift(247);                     // 'times'
    eventHandler.endNonterminal("FTTimes", e0);
  }

  function try_FTTimes()
  {
    shiftT(195);                    // 'occurs'
    lookahead1W(149);               // S^WS | '(:' | 'at' | 'exactly' | 'from'
    try_FTRange();
    shiftT(247);                    // 'times'
  }

  function parse_FTRange()
  {
    eventHandler.startNonterminal("FTRange", e0);
    switch (l1)
    {
    case 130:                       // 'exactly'
      shift(130);                   // 'exactly'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_AdditiveExpr();
      break;
    case 81:                        // 'at'
      shift(81);                    // 'at'
      lookahead1W(125);             // S^WS | '(:' | 'least' | 'most'
      switch (l1)
      {
      case 173:                     // 'least'
        shift(173);                 // 'least'
        lookahead1W(265);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        whitespace();
        parse_AdditiveExpr();
        break;
      default:
        shift(183);                 // 'most'
        lookahead1W(265);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        whitespace();
        parse_AdditiveExpr();
      }
      break;
    default:
      shift(140);                   // 'from'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_AdditiveExpr();
      shift(248);                   // 'to'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_AdditiveExpr();
    }
    eventHandler.endNonterminal("FTRange", e0);
  }

  function try_FTRange()
  {
    switch (l1)
    {
    case 130:                       // 'exactly'
      shiftT(130);                  // 'exactly'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_AdditiveExpr();
      break;
    case 81:                        // 'at'
      shiftT(81);                   // 'at'
      lookahead1W(125);             // S^WS | '(:' | 'least' | 'most'
      switch (l1)
      {
      case 173:                     // 'least'
        shiftT(173);                // 'least'
        lookahead1W(265);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        try_AdditiveExpr();
        break;
      default:
        shiftT(183);                // 'most'
        lookahead1W(265);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        try_AdditiveExpr();
      }
      break;
    default:
      shiftT(140);                  // 'from'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_AdditiveExpr();
      shiftT(248);                  // 'to'
      lookahead1W(265);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      try_AdditiveExpr();
    }
  }

  function parse_FTPosFilter()
  {
    eventHandler.startNonterminal("FTPosFilter", e0);
    switch (l1)
    {
    case 202:                       // 'ordered'
      parse_FTOrder();
      break;
    case 269:                       // 'window'
      parse_FTWindow();
      break;
    case 117:                       // 'distance'
      parse_FTDistance();
      break;
    case 115:                       // 'different'
    case 223:                       // 'same'
      parse_FTScope();
      break;
    default:
      parse_FTContent();
    }
    eventHandler.endNonterminal("FTPosFilter", e0);
  }

  function try_FTPosFilter()
  {
    switch (l1)
    {
    case 202:                       // 'ordered'
      try_FTOrder();
      break;
    case 269:                       // 'window'
      try_FTWindow();
      break;
    case 117:                       // 'distance'
      try_FTDistance();
      break;
    case 115:                       // 'different'
    case 223:                       // 'same'
      try_FTScope();
      break;
    default:
      try_FTContent();
    }
  }

  function parse_FTOrder()
  {
    eventHandler.startNonterminal("FTOrder", e0);
    shift(202);                     // 'ordered'
    eventHandler.endNonterminal("FTOrder", e0);
  }

  function try_FTOrder()
  {
    shiftT(202);                    // 'ordered'
  }

  function parse_FTWindow()
  {
    eventHandler.startNonterminal("FTWindow", e0);
    shift(269);                     // 'window'
    lookahead1W(265);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_AdditiveExpr();
    whitespace();
    parse_FTUnit();
    eventHandler.endNonterminal("FTWindow", e0);
  }

  function try_FTWindow()
  {
    shiftT(269);                    // 'window'
    lookahead1W(265);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_AdditiveExpr();
    try_FTUnit();
  }

  function parse_FTDistance()
  {
    eventHandler.startNonterminal("FTDistance", e0);
    shift(117);                     // 'distance'
    lookahead1W(149);               // S^WS | '(:' | 'at' | 'exactly' | 'from'
    whitespace();
    parse_FTRange();
    whitespace();
    parse_FTUnit();
    eventHandler.endNonterminal("FTDistance", e0);
  }

  function try_FTDistance()
  {
    shiftT(117);                    // 'distance'
    lookahead1W(149);               // S^WS | '(:' | 'at' | 'exactly' | 'from'
    try_FTRange();
    try_FTUnit();
  }

  function parse_FTUnit()
  {
    eventHandler.startNonterminal("FTUnit", e0);
    switch (l1)
    {
    case 273:                       // 'words'
      shift(273);                   // 'words'
      break;
    case 232:                       // 'sentences'
      shift(232);                   // 'sentences'
      break;
    default:
      shift(205);                   // 'paragraphs'
    }
    eventHandler.endNonterminal("FTUnit", e0);
  }

  function try_FTUnit()
  {
    switch (l1)
    {
    case 273:                       // 'words'
      shiftT(273);                  // 'words'
      break;
    case 232:                       // 'sentences'
      shiftT(232);                  // 'sentences'
      break;
    default:
      shiftT(205);                  // 'paragraphs'
    }
  }

  function parse_FTScope()
  {
    eventHandler.startNonterminal("FTScope", e0);
    switch (l1)
    {
    case 223:                       // 'same'
      shift(223);                   // 'same'
      break;
    default:
      shift(115);                   // 'different'
    }
    lookahead1W(132);               // S^WS | '(:' | 'paragraph' | 'sentence'
    whitespace();
    parse_FTBigUnit();
    eventHandler.endNonterminal("FTScope", e0);
  }

  function try_FTScope()
  {
    switch (l1)
    {
    case 223:                       // 'same'
      shiftT(223);                  // 'same'
      break;
    default:
      shiftT(115);                  // 'different'
    }
    lookahead1W(132);               // S^WS | '(:' | 'paragraph' | 'sentence'
    try_FTBigUnit();
  }

  function parse_FTBigUnit()
  {
    eventHandler.startNonterminal("FTBigUnit", e0);
    switch (l1)
    {
    case 231:                       // 'sentence'
      shift(231);                   // 'sentence'
      break;
    default:
      shift(204);                   // 'paragraph'
    }
    eventHandler.endNonterminal("FTBigUnit", e0);
  }

  function try_FTBigUnit()
  {
    switch (l1)
    {
    case 231:                       // 'sentence'
      shiftT(231);                  // 'sentence'
      break;
    default:
      shiftT(204);                  // 'paragraph'
    }
  }

  function parse_FTContent()
  {
    eventHandler.startNonterminal("FTContent", e0);
    switch (l1)
    {
    case 81:                        // 'at'
      shift(81);                    // 'at'
      lookahead1W(117);             // S^WS | '(:' | 'end' | 'start'
      switch (l1)
      {
      case 237:                     // 'start'
        shift(237);                 // 'start'
        break;
      default:
        shift(126);                 // 'end'
      }
      break;
    default:
      shift(127);                   // 'entire'
      lookahead1W(42);              // S^WS | '(:' | 'content'
      shift(100);                   // 'content'
    }
    eventHandler.endNonterminal("FTContent", e0);
  }

  function try_FTContent()
  {
    switch (l1)
    {
    case 81:                        // 'at'
      shiftT(81);                   // 'at'
      lookahead1W(117);             // S^WS | '(:' | 'end' | 'start'
      switch (l1)
      {
      case 237:                     // 'start'
        shiftT(237);                // 'start'
        break;
      default:
        shiftT(126);                // 'end'
      }
      break;
    default:
      shiftT(127);                  // 'entire'
      lookahead1W(42);              // S^WS | '(:' | 'content'
      shiftT(100);                  // 'content'
    }
  }

  function parse_FTMatchOptions()
  {
    eventHandler.startNonterminal("FTMatchOptions", e0);
    for (;;)
    {
      shift(259);                   // 'using'
      lookahead1W(182);             // S^WS | '(:' | 'case' | 'diacritics' | 'language' | 'lowercase' | 'no' |
      whitespace();
      parse_FTMatchOption();
      lookahead1W(214);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 != 259)                // 'using'
      {
        break;
      }
    }
    eventHandler.endNonterminal("FTMatchOptions", e0);
  }

  function try_FTMatchOptions()
  {
    for (;;)
    {
      shiftT(259);                  // 'using'
      lookahead1W(182);             // S^WS | '(:' | 'case' | 'diacritics' | 'language' | 'lowercase' | 'no' |
      try_FTMatchOption();
      lookahead1W(214);             // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
      if (l1 != 259)                // 'using'
      {
        break;
      }
    }
  }

  function parse_FTMatchOption()
  {
    eventHandler.startNonterminal("FTMatchOption", e0);
    switch (l1)
    {
    case 188:                       // 'no'
      lookahead2W(161);             // S^WS | '(:' | 'stemming' | 'stop' | 'thesaurus' | 'wildcards'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 169:                       // 'language'
      parse_FTLanguageOption();
      break;
    case 268:                       // 'wildcards'
    case 137404:                    // 'no' 'wildcards'
      parse_FTWildCardOption();
      break;
    case 246:                       // 'thesaurus'
    case 126140:                    // 'no' 'thesaurus'
      parse_FTThesaurusOption();
      break;
    case 238:                       // 'stemming'
    case 122044:                    // 'no' 'stemming'
      parse_FTStemOption();
      break;
    case 114:                       // 'diacritics'
      parse_FTDiacriticsOption();
      break;
    case 239:                       // 'stop'
    case 122556:                    // 'no' 'stop'
      parse_FTStopWordOption();
      break;
    case 199:                       // 'option'
      parse_FTExtensionOption();
      break;
    default:
      parse_FTCaseOption();
    }
    eventHandler.endNonterminal("FTMatchOption", e0);
  }

  function try_FTMatchOption()
  {
    switch (l1)
    {
    case 188:                       // 'no'
      lookahead2W(161);             // S^WS | '(:' | 'stemming' | 'stop' | 'thesaurus' | 'wildcards'
      break;
    default:
      lk = l1;
    }
    switch (lk)
    {
    case 169:                       // 'language'
      try_FTLanguageOption();
      break;
    case 268:                       // 'wildcards'
    case 137404:                    // 'no' 'wildcards'
      try_FTWildCardOption();
      break;
    case 246:                       // 'thesaurus'
    case 126140:                    // 'no' 'thesaurus'
      try_FTThesaurusOption();
      break;
    case 238:                       // 'stemming'
    case 122044:                    // 'no' 'stemming'
      try_FTStemOption();
      break;
    case 114:                       // 'diacritics'
      try_FTDiacriticsOption();
      break;
    case 239:                       // 'stop'
    case 122556:                    // 'no' 'stop'
      try_FTStopWordOption();
      break;
    case 199:                       // 'option'
      try_FTExtensionOption();
      break;
    default:
      try_FTCaseOption();
    }
  }

  function parse_FTCaseOption()
  {
    eventHandler.startNonterminal("FTCaseOption", e0);
    switch (l1)
    {
    case 88:                        // 'case'
      shift(88);                    // 'case'
      lookahead1W(124);             // S^WS | '(:' | 'insensitive' | 'sensitive'
      switch (l1)
      {
      case 158:                     // 'insensitive'
        shift(158);                 // 'insensitive'
        break;
      default:
        shift(230);                 // 'sensitive'
      }
      break;
    case 177:                       // 'lowercase'
      shift(177);                   // 'lowercase'
      break;
    default:
      shift(258);                   // 'uppercase'
    }
    eventHandler.endNonterminal("FTCaseOption", e0);
  }

  function try_FTCaseOption()
  {
    switch (l1)
    {
    case 88:                        // 'case'
      shiftT(88);                   // 'case'
      lookahead1W(124);             // S^WS | '(:' | 'insensitive' | 'sensitive'
      switch (l1)
      {
      case 158:                     // 'insensitive'
        shiftT(158);                // 'insensitive'
        break;
      default:
        shiftT(230);                // 'sensitive'
      }
      break;
    case 177:                       // 'lowercase'
      shiftT(177);                  // 'lowercase'
      break;
    default:
      shiftT(258);                  // 'uppercase'
    }
  }

  function parse_FTDiacriticsOption()
  {
    eventHandler.startNonterminal("FTDiacriticsOption", e0);
    shift(114);                     // 'diacritics'
    lookahead1W(124);               // S^WS | '(:' | 'insensitive' | 'sensitive'
    switch (l1)
    {
    case 158:                       // 'insensitive'
      shift(158);                   // 'insensitive'
      break;
    default:
      shift(230);                   // 'sensitive'
    }
    eventHandler.endNonterminal("FTDiacriticsOption", e0);
  }

  function try_FTDiacriticsOption()
  {
    shiftT(114);                    // 'diacritics'
    lookahead1W(124);               // S^WS | '(:' | 'insensitive' | 'sensitive'
    switch (l1)
    {
    case 158:                       // 'insensitive'
      shiftT(158);                  // 'insensitive'
      break;
    default:
      shiftT(230);                  // 'sensitive'
    }
  }

  function parse_FTStemOption()
  {
    eventHandler.startNonterminal("FTStemOption", e0);
    switch (l1)
    {
    case 238:                       // 'stemming'
      shift(238);                   // 'stemming'
      break;
    default:
      shift(188);                   // 'no'
      lookahead1W(74);              // S^WS | '(:' | 'stemming'
      shift(238);                   // 'stemming'
    }
    eventHandler.endNonterminal("FTStemOption", e0);
  }

  function try_FTStemOption()
  {
    switch (l1)
    {
    case 238:                       // 'stemming'
      shiftT(238);                  // 'stemming'
      break;
    default:
      shiftT(188);                  // 'no'
      lookahead1W(74);              // S^WS | '(:' | 'stemming'
      shiftT(238);                  // 'stemming'
    }
  }

  function parse_FTThesaurusOption()
  {
    eventHandler.startNonterminal("FTThesaurusOption", e0);
    switch (l1)
    {
    case 246:                       // 'thesaurus'
      shift(246);                   // 'thesaurus'
      lookahead1W(142);             // S^WS | '(' | '(:' | 'at' | 'default'
      switch (l1)
      {
      case 81:                      // 'at'
        whitespace();
        parse_FTThesaurusID();
        break;
      case 109:                     // 'default'
        shift(109);                 // 'default'
        break;
      default:
        shift(34);                  // '('
        lookahead1W(112);           // S^WS | '(:' | 'at' | 'default'
        switch (l1)
        {
        case 81:                    // 'at'
          whitespace();
          parse_FTThesaurusID();
          break;
        default:
          shift(109);               // 'default'
        }
        for (;;)
        {
          lookahead1W(101);         // S^WS | '(:' | ')' | ','
          if (l1 != 41)             // ','
          {
            break;
          }
          shift(41);                // ','
          lookahead1W(31);          // S^WS | '(:' | 'at'
          whitespace();
          parse_FTThesaurusID();
        }
        shift(37);                  // ')'
      }
      break;
    default:
      shift(188);                   // 'no'
      lookahead1W(78);              // S^WS | '(:' | 'thesaurus'
      shift(246);                   // 'thesaurus'
    }
    eventHandler.endNonterminal("FTThesaurusOption", e0);
  }

  function try_FTThesaurusOption()
  {
    switch (l1)
    {
    case 246:                       // 'thesaurus'
      shiftT(246);                  // 'thesaurus'
      lookahead1W(142);             // S^WS | '(' | '(:' | 'at' | 'default'
      switch (l1)
      {
      case 81:                      // 'at'
        try_FTThesaurusID();
        break;
      case 109:                     // 'default'
        shiftT(109);                // 'default'
        break;
      default:
        shiftT(34);                 // '('
        lookahead1W(112);           // S^WS | '(:' | 'at' | 'default'
        switch (l1)
        {
        case 81:                    // 'at'
          try_FTThesaurusID();
          break;
        default:
          shiftT(109);              // 'default'
        }
        for (;;)
        {
          lookahead1W(101);         // S^WS | '(:' | ')' | ','
          if (l1 != 41)             // ','
          {
            break;
          }
          shiftT(41);               // ','
          lookahead1W(31);          // S^WS | '(:' | 'at'
          try_FTThesaurusID();
        }
        shiftT(37);                 // ')'
      }
      break;
    default:
      shiftT(188);                  // 'no'
      lookahead1W(78);              // S^WS | '(:' | 'thesaurus'
      shiftT(246);                  // 'thesaurus'
    }
  }

  function parse_FTThesaurusID()
  {
    eventHandler.startNonterminal("FTThesaurusID", e0);
    shift(81);                      // 'at'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    lookahead1W(220);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    if (l1 == 217)                  // 'relationship'
    {
      shift(217);                   // 'relationship'
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shift(11);                    // StringLiteral
    }
    lookahead1W(216);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    switch (l1)
    {
    case 81:                        // 'at'
      lookahead2W(165);             // S^WS | '(:' | 'end' | 'least' | 'most' | 'position' | 'start'
      break;
    default:
      lk = l1;
    }
    if (lk == 130                   // 'exactly'
     || lk == 140                   // 'from'
     || lk == 88657                 // 'at' 'least'
     || lk == 93777)                // 'at' 'most'
    {
      whitespace();
      parse_FTLiteralRange();
      lookahead1W(58);              // S^WS | '(:' | 'levels'
      shift(175);                   // 'levels'
    }
    eventHandler.endNonterminal("FTThesaurusID", e0);
  }

  function try_FTThesaurusID()
  {
    shiftT(81);                     // 'at'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shiftT(7);                      // URILiteral
    lookahead1W(220);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    if (l1 == 217)                  // 'relationship'
    {
      shiftT(217);                  // 'relationship'
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shiftT(11);                   // StringLiteral
    }
    lookahead1W(216);               // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
    switch (l1)
    {
    case 81:                        // 'at'
      lookahead2W(165);             // S^WS | '(:' | 'end' | 'least' | 'most' | 'position' | 'start'
      break;
    default:
      lk = l1;
    }
    if (lk == 130                   // 'exactly'
     || lk == 140                   // 'from'
     || lk == 88657                 // 'at' 'least'
     || lk == 93777)                // 'at' 'most'
    {
      try_FTLiteralRange();
      lookahead1W(58);              // S^WS | '(:' | 'levels'
      shiftT(175);                  // 'levels'
    }
  }

  function parse_FTLiteralRange()
  {
    eventHandler.startNonterminal("FTLiteralRange", e0);
    switch (l1)
    {
    case 130:                       // 'exactly'
      shift(130);                   // 'exactly'
      lookahead1W(16);              // IntegerLiteral | S^WS | '(:'
      shift(8);                     // IntegerLiteral
      break;
    case 81:                        // 'at'
      shift(81);                    // 'at'
      lookahead1W(125);             // S^WS | '(:' | 'least' | 'most'
      switch (l1)
      {
      case 173:                     // 'least'
        shift(173);                 // 'least'
        lookahead1W(16);            // IntegerLiteral | S^WS | '(:'
        shift(8);                   // IntegerLiteral
        break;
      default:
        shift(183);                 // 'most'
        lookahead1W(16);            // IntegerLiteral | S^WS | '(:'
        shift(8);                   // IntegerLiteral
      }
      break;
    default:
      shift(140);                   // 'from'
      lookahead1W(16);              // IntegerLiteral | S^WS | '(:'
      shift(8);                     // IntegerLiteral
      lookahead1W(79);              // S^WS | '(:' | 'to'
      shift(248);                   // 'to'
      lookahead1W(16);              // IntegerLiteral | S^WS | '(:'
      shift(8);                     // IntegerLiteral
    }
    eventHandler.endNonterminal("FTLiteralRange", e0);
  }

  function try_FTLiteralRange()
  {
    switch (l1)
    {
    case 130:                       // 'exactly'
      shiftT(130);                  // 'exactly'
      lookahead1W(16);              // IntegerLiteral | S^WS | '(:'
      shiftT(8);                    // IntegerLiteral
      break;
    case 81:                        // 'at'
      shiftT(81);                   // 'at'
      lookahead1W(125);             // S^WS | '(:' | 'least' | 'most'
      switch (l1)
      {
      case 173:                     // 'least'
        shiftT(173);                // 'least'
        lookahead1W(16);            // IntegerLiteral | S^WS | '(:'
        shiftT(8);                  // IntegerLiteral
        break;
      default:
        shiftT(183);                // 'most'
        lookahead1W(16);            // IntegerLiteral | S^WS | '(:'
        shiftT(8);                  // IntegerLiteral
      }
      break;
    default:
      shiftT(140);                  // 'from'
      lookahead1W(16);              // IntegerLiteral | S^WS | '(:'
      shiftT(8);                    // IntegerLiteral
      lookahead1W(79);              // S^WS | '(:' | 'to'
      shiftT(248);                  // 'to'
      lookahead1W(16);              // IntegerLiteral | S^WS | '(:'
      shiftT(8);                    // IntegerLiteral
    }
  }

  function parse_FTStopWordOption()
  {
    eventHandler.startNonterminal("FTStopWordOption", e0);
    switch (l1)
    {
    case 239:                       // 'stop'
      shift(239);                   // 'stop'
      lookahead1W(86);              // S^WS | '(:' | 'words'
      shift(273);                   // 'words'
      lookahead1W(142);             // S^WS | '(' | '(:' | 'at' | 'default'
      switch (l1)
      {
      case 109:                     // 'default'
        shift(109);                 // 'default'
        for (;;)
        {
          lookahead1W(217);         // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
          if (l1 != 131             // 'except'
           && l1 != 254)            // 'union'
          {
            break;
          }
          whitespace();
          parse_FTStopWordsInclExcl();
        }
        break;
      default:
        whitespace();
        parse_FTStopWords();
        for (;;)
        {
          lookahead1W(217);         // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
          if (l1 != 131             // 'except'
           && l1 != 254)            // 'union'
          {
            break;
          }
          whitespace();
          parse_FTStopWordsInclExcl();
        }
      }
      break;
    default:
      shift(188);                   // 'no'
      lookahead1W(75);              // S^WS | '(:' | 'stop'
      shift(239);                   // 'stop'
      lookahead1W(86);              // S^WS | '(:' | 'words'
      shift(273);                   // 'words'
    }
    eventHandler.endNonterminal("FTStopWordOption", e0);
  }

  function try_FTStopWordOption()
  {
    switch (l1)
    {
    case 239:                       // 'stop'
      shiftT(239);                  // 'stop'
      lookahead1W(86);              // S^WS | '(:' | 'words'
      shiftT(273);                  // 'words'
      lookahead1W(142);             // S^WS | '(' | '(:' | 'at' | 'default'
      switch (l1)
      {
      case 109:                     // 'default'
        shiftT(109);                // 'default'
        for (;;)
        {
          lookahead1W(217);         // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
          if (l1 != 131             // 'except'
           && l1 != 254)            // 'union'
          {
            break;
          }
          try_FTStopWordsInclExcl();
        }
        break;
      default:
        try_FTStopWords();
        for (;;)
        {
          lookahead1W(217);         // S^WS | EOF | '!=' | '(:' | ')' | ',' | ':' | ';' | '<' | '<<' | '<=' | '=' |
          if (l1 != 131             // 'except'
           && l1 != 254)            // 'union'
          {
            break;
          }
          try_FTStopWordsInclExcl();
        }
      }
      break;
    default:
      shiftT(188);                  // 'no'
      lookahead1W(75);              // S^WS | '(:' | 'stop'
      shiftT(239);                  // 'stop'
      lookahead1W(86);              // S^WS | '(:' | 'words'
      shiftT(273);                  // 'words'
    }
  }

  function parse_FTStopWords()
  {
    eventHandler.startNonterminal("FTStopWords", e0);
    switch (l1)
    {
    case 81:                        // 'at'
      shift(81);                    // 'at'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shift(7);                     // URILiteral
      break;
    default:
      shift(34);                    // '('
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shift(11);                    // StringLiteral
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shift(41);                  // ','
        lookahead1W(17);            // StringLiteral | S^WS | '(:'
        shift(11);                  // StringLiteral
      }
      shift(37);                    // ')'
    }
    eventHandler.endNonterminal("FTStopWords", e0);
  }

  function try_FTStopWords()
  {
    switch (l1)
    {
    case 81:                        // 'at'
      shiftT(81);                   // 'at'
      lookahead1W(15);              // URILiteral | S^WS | '(:'
      shiftT(7);                    // URILiteral
      break;
    default:
      shiftT(34);                   // '('
      lookahead1W(17);              // StringLiteral | S^WS | '(:'
      shiftT(11);                   // StringLiteral
      for (;;)
      {
        lookahead1W(101);           // S^WS | '(:' | ')' | ','
        if (l1 != 41)               // ','
        {
          break;
        }
        shiftT(41);                 // ','
        lookahead1W(17);            // StringLiteral | S^WS | '(:'
        shiftT(11);                 // StringLiteral
      }
      shiftT(37);                   // ')'
    }
  }

  function parse_FTStopWordsInclExcl()
  {
    eventHandler.startNonterminal("FTStopWordsInclExcl", e0);
    switch (l1)
    {
    case 254:                       // 'union'
      shift(254);                   // 'union'
      break;
    default:
      shift(131);                   // 'except'
    }
    lookahead1W(99);                // S^WS | '(' | '(:' | 'at'
    whitespace();
    parse_FTStopWords();
    eventHandler.endNonterminal("FTStopWordsInclExcl", e0);
  }

  function try_FTStopWordsInclExcl()
  {
    switch (l1)
    {
    case 254:                       // 'union'
      shiftT(254);                  // 'union'
      break;
    default:
      shiftT(131);                  // 'except'
    }
    lookahead1W(99);                // S^WS | '(' | '(:' | 'at'
    try_FTStopWords();
  }

  function parse_FTLanguageOption()
  {
    eventHandler.startNonterminal("FTLanguageOption", e0);
    shift(169);                     // 'language'
    lookahead1W(17);                // StringLiteral | S^WS | '(:'
    shift(11);                      // StringLiteral
    eventHandler.endNonterminal("FTLanguageOption", e0);
  }

  function try_FTLanguageOption()
  {
    shiftT(169);                    // 'language'
    lookahead1W(17);                // StringLiteral | S^WS | '(:'
    shiftT(11);                     // StringLiteral
  }

  function parse_FTWildCardOption()
  {
    eventHandler.startNonterminal("FTWildCardOption", e0);
    switch (l1)
    {
    case 268:                       // 'wildcards'
      shift(268);                   // 'wildcards'
      break;
    default:
      shift(188);                   // 'no'
      lookahead1W(84);              // S^WS | '(:' | 'wildcards'
      shift(268);                   // 'wildcards'
    }
    eventHandler.endNonterminal("FTWildCardOption", e0);
  }

  function try_FTWildCardOption()
  {
    switch (l1)
    {
    case 268:                       // 'wildcards'
      shiftT(268);                  // 'wildcards'
      break;
    default:
      shiftT(188);                  // 'no'
      lookahead1W(84);              // S^WS | '(:' | 'wildcards'
      shiftT(268);                  // 'wildcards'
    }
  }

  function parse_FTExtensionOption()
  {
    eventHandler.startNonterminal("FTExtensionOption", e0);
    shift(199);                     // 'option'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(17);                // StringLiteral | S^WS | '(:'
    shift(11);                      // StringLiteral
    eventHandler.endNonterminal("FTExtensionOption", e0);
  }

  function try_FTExtensionOption()
  {
    shiftT(199);                    // 'option'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    try_EQName();
    lookahead1W(17);                // StringLiteral | S^WS | '(:'
    shiftT(11);                     // StringLiteral
  }

  function parse_FTIgnoreOption()
  {
    eventHandler.startNonterminal("FTIgnoreOption", e0);
    shift(271);                     // 'without'
    lookahead1W(42);                // S^WS | '(:' | 'content'
    shift(100);                     // 'content'
    lookahead1W(265);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_UnionExpr();
    eventHandler.endNonterminal("FTIgnoreOption", e0);
  }

  function try_FTIgnoreOption()
  {
    shiftT(271);                    // 'without'
    lookahead1W(42);                // S^WS | '(:' | 'content'
    shiftT(100);                    // 'content'
    lookahead1W(265);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    try_UnionExpr();
  }

  function parse_CollectionDecl()
  {
    eventHandler.startNonterminal("CollectionDecl", e0);
    shift(95);                      // 'collection'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(107);               // S^WS | '(:' | ';' | 'as'
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_CollectionTypeDecl();
    }
    eventHandler.endNonterminal("CollectionDecl", e0);
  }

  function parse_CollectionTypeDecl()
  {
    eventHandler.startNonterminal("CollectionTypeDecl", e0);
    shift(79);                      // 'as'
    lookahead1W(178);               // S^WS | '(:' | 'attribute' | 'comment' | 'document-node' | 'element' |
    whitespace();
    parse_KindTest();
    lookahead1W(156);               // S^WS | '(:' | '*' | '+' | ';' | '?'
    if (l1 != 53)                   // ';'
    {
      whitespace();
      parse_OccurrenceIndicator();
    }
    eventHandler.endNonterminal("CollectionTypeDecl", e0);
  }

  function parse_IndexName()
  {
    eventHandler.startNonterminal("IndexName", e0);
    parse_EQName();
    eventHandler.endNonterminal("IndexName", e0);
  }

  function parse_IndexDomainExpr()
  {
    eventHandler.startNonterminal("IndexDomainExpr", e0);
    parse_PathExpr();
    eventHandler.endNonterminal("IndexDomainExpr", e0);
  }

  function parse_IndexKeySpec()
  {
    eventHandler.startNonterminal("IndexKeySpec", e0);
    parse_IndexKeyExpr();
    if (l1 == 79)                   // 'as'
    {
      whitespace();
      parse_IndexKeyTypeDecl();
    }
    lookahead1W(146);               // S^WS | '(:' | ',' | ';' | 'collation'
    if (l1 == 94)                   // 'collation'
    {
      whitespace();
      parse_IndexKeyCollation();
    }
    eventHandler.endNonterminal("IndexKeySpec", e0);
  }

  function parse_IndexKeyExpr()
  {
    eventHandler.startNonterminal("IndexKeyExpr", e0);
    parse_PathExpr();
    eventHandler.endNonterminal("IndexKeyExpr", e0);
  }

  function parse_IndexKeyTypeDecl()
  {
    eventHandler.startNonterminal("IndexKeyTypeDecl", e0);
    shift(79);                      // 'as'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_AtomicType();
    lookahead1W(169);               // S^WS | '(:' | '*' | '+' | ',' | ';' | '?' | 'collation'
    if (l1 == 39                    // '*'
     || l1 == 40                    // '+'
     || l1 == 64)                   // '?'
    {
      whitespace();
      parse_OccurrenceIndicator();
    }
    eventHandler.endNonterminal("IndexKeyTypeDecl", e0);
  }

  function parse_AtomicType()
  {
    eventHandler.startNonterminal("AtomicType", e0);
    parse_EQName();
    eventHandler.endNonterminal("AtomicType", e0);
  }

  function parse_IndexKeyCollation()
  {
    eventHandler.startNonterminal("IndexKeyCollation", e0);
    shift(94);                      // 'collation'
    lookahead1W(15);                // URILiteral | S^WS | '(:'
    shift(7);                       // URILiteral
    eventHandler.endNonterminal("IndexKeyCollation", e0);
  }

  function parse_IndexDecl()
  {
    eventHandler.startNonterminal("IndexDecl", e0);
    shift(155);                     // 'index'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_IndexName();
    lookahead1W(65);                // S^WS | '(:' | 'on'
    shift(197);                     // 'on'
    lookahead1W(63);                // S^WS | '(:' | 'nodes'
    shift(192);                     // 'nodes'
    lookahead1W(264);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_IndexDomainExpr();
    shift(87);                      // 'by'
    lookahead1W(264);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_IndexKeySpec();
    for (;;)
    {
      lookahead1W(103);             // S^WS | '(:' | ',' | ';'
      if (l1 != 41)                 // ','
      {
        break;
      }
      shift(41);                    // ','
      lookahead1W(264);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      whitespace();
      parse_IndexKeySpec();
    }
    eventHandler.endNonterminal("IndexDecl", e0);
  }

  function parse_ICDecl()
  {
    eventHandler.startNonterminal("ICDecl", e0);
    shift(161);                     // 'integrity'
    lookahead1W(40);                // S^WS | '(:' | 'constraint'
    shift(97);                      // 'constraint'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(120);               // S^WS | '(:' | 'foreign' | 'on'
    switch (l1)
    {
    case 197:                       // 'on'
      whitespace();
      parse_ICCollection();
      break;
    default:
      whitespace();
      parse_ICForeignKey();
    }
    eventHandler.endNonterminal("ICDecl", e0);
  }

  function parse_ICCollection()
  {
    eventHandler.startNonterminal("ICCollection", e0);
    shift(197);                     // 'on'
    lookahead1W(39);                // S^WS | '(:' | 'collection'
    shift(95);                      // 'collection'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(140);               // S^WS | '$' | '(:' | 'foreach' | 'node'
    switch (l1)
    {
    case 31:                        // '$'
      whitespace();
      parse_ICCollSequence();
      break;
    case 191:                       // 'node'
      whitespace();
      parse_ICCollSequenceUnique();
      break;
    default:
      whitespace();
      parse_ICCollNode();
    }
    eventHandler.endNonterminal("ICCollection", e0);
  }

  function parse_ICCollSequence()
  {
    eventHandler.startNonterminal("ICCollSequence", e0);
    parse_VarRef();
    lookahead1W(37);                // S^WS | '(:' | 'check'
    shift(92);                      // 'check'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("ICCollSequence", e0);
  }

  function parse_ICCollSequenceUnique()
  {
    eventHandler.startNonterminal("ICCollSequenceUnique", e0);
    shift(191);                     // 'node'
    lookahead1W(21);                // S^WS | '$' | '(:'
    whitespace();
    parse_VarRef();
    lookahead1W(37);                // S^WS | '(:' | 'check'
    shift(92);                      // 'check'
    lookahead1W(80);                // S^WS | '(:' | 'unique'
    shift(255);                     // 'unique'
    lookahead1W(57);                // S^WS | '(:' | 'key'
    shift(168);                     // 'key'
    lookahead1W(264);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_PathExpr();
    eventHandler.endNonterminal("ICCollSequenceUnique", e0);
  }

  function parse_ICCollNode()
  {
    eventHandler.startNonterminal("ICCollNode", e0);
    shift(138);                     // 'foreach'
    lookahead1W(62);                // S^WS | '(:' | 'node'
    shift(191);                     // 'node'
    lookahead1W(21);                // S^WS | '$' | '(:'
    whitespace();
    parse_VarRef();
    lookahead1W(37);                // S^WS | '(:' | 'check'
    shift(92);                      // 'check'
    lookahead1W(266);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_ExprSingle();
    eventHandler.endNonterminal("ICCollNode", e0);
  }

  function parse_ICForeignKey()
  {
    eventHandler.startNonterminal("ICForeignKey", e0);
    shift(139);                     // 'foreign'
    lookahead1W(57);                // S^WS | '(:' | 'key'
    shift(168);                     // 'key'
    lookahead1W(51);                // S^WS | '(:' | 'from'
    whitespace();
    parse_ICForeignKeySource();
    whitespace();
    parse_ICForeignKeyTarget();
    eventHandler.endNonterminal("ICForeignKey", e0);
  }

  function parse_ICForeignKeySource()
  {
    eventHandler.startNonterminal("ICForeignKeySource", e0);
    shift(140);                     // 'from'
    lookahead1W(39);                // S^WS | '(:' | 'collection'
    whitespace();
    parse_ICForeignKeyValues();
    eventHandler.endNonterminal("ICForeignKeySource", e0);
  }

  function parse_ICForeignKeyTarget()
  {
    eventHandler.startNonterminal("ICForeignKeyTarget", e0);
    shift(248);                     // 'to'
    lookahead1W(39);                // S^WS | '(:' | 'collection'
    whitespace();
    parse_ICForeignKeyValues();
    eventHandler.endNonterminal("ICForeignKeyTarget", e0);
  }

  function parse_ICForeignKeyValues()
  {
    eventHandler.startNonterminal("ICForeignKeyValues", e0);
    shift(95);                      // 'collection'
    lookahead1W(249);               // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
    whitespace();
    parse_EQName();
    lookahead1W(62);                // S^WS | '(:' | 'node'
    shift(191);                     // 'node'
    lookahead1W(21);                // S^WS | '$' | '(:'
    whitespace();
    parse_VarRef();
    lookahead1W(57);                // S^WS | '(:' | 'key'
    shift(168);                     // 'key'
    lookahead1W(264);               // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
    whitespace();
    parse_PathExpr();
    eventHandler.endNonterminal("ICForeignKeyValues", e0);
  }

  function try_Comment()
  {
    shiftT(36);                     // '(:'
    for (;;)
    {
      lookahead1(89);               // CommentContents | '(:' | ':)'
      if (l1 == 50)                 // ':)'
      {
        break;
      }
      switch (l1)
      {
      case 24:                      // CommentContents
        shiftT(24);                 // CommentContents
        break;
      default:
        try_Comment();
      }
    }
    shiftT(50);                     // ':)'
  }

  function try_Whitespace()
  {
    switch (l1)
    {
    case 22:                        // S^WS
      shiftT(22);                   // S^WS
      break;
    default:
      try_Comment();
    }
  }

  function parse_EQName()
  {
    eventHandler.startNonterminal("EQName", e0);
    lookahead1(247);                // EQName^Token | 'after' | 'allowing' | 'ancestor' | 'ancestor-or-self' | 'and' |
    switch (l1)
    {
    case 82:                        // 'attribute'
      shift(82);                    // 'attribute'
      break;
    case 96:                        // 'comment'
      shift(96);                    // 'comment'
      break;
    case 120:                       // 'document-node'
      shift(120);                   // 'document-node'
      break;
    case 121:                       // 'element'
      shift(121);                   // 'element'
      break;
    case 124:                       // 'empty-sequence'
      shift(124);                   // 'empty-sequence'
      break;
    case 145:                       // 'function'
      shift(145);                   // 'function'
      break;
    case 152:                       // 'if'
      shift(152);                   // 'if'
      break;
    case 165:                       // 'item'
      shift(165);                   // 'item'
      break;
    case 185:                       // 'namespace-node'
      shift(185);                   // 'namespace-node'
      break;
    case 191:                       // 'node'
      shift(191);                   // 'node'
      break;
    case 216:                       // 'processing-instruction'
      shift(216);                   // 'processing-instruction'
      break;
    case 226:                       // 'schema-attribute'
      shift(226);                   // 'schema-attribute'
      break;
    case 227:                       // 'schema-element'
      shift(227);                   // 'schema-element'
      break;
    case 243:                       // 'switch'
      shift(243);                   // 'switch'
      break;
    case 244:                       // 'text'
      shift(244);                   // 'text'
      break;
    case 253:                       // 'typeswitch'
      shift(253);                   // 'typeswitch'
      break;
    default:
      parse_FunctionName();
    }
    eventHandler.endNonterminal("EQName", e0);
  }

  function try_EQName()
  {
    lookahead1(247);                // EQName^Token | 'after' | 'allowing' | 'ancestor' | 'ancestor-or-self' | 'and' |
    switch (l1)
    {
    case 82:                        // 'attribute'
      shiftT(82);                   // 'attribute'
      break;
    case 96:                        // 'comment'
      shiftT(96);                   // 'comment'
      break;
    case 120:                       // 'document-node'
      shiftT(120);                  // 'document-node'
      break;
    case 121:                       // 'element'
      shiftT(121);                  // 'element'
      break;
    case 124:                       // 'empty-sequence'
      shiftT(124);                  // 'empty-sequence'
      break;
    case 145:                       // 'function'
      shiftT(145);                  // 'function'
      break;
    case 152:                       // 'if'
      shiftT(152);                  // 'if'
      break;
    case 165:                       // 'item'
      shiftT(165);                  // 'item'
      break;
    case 185:                       // 'namespace-node'
      shiftT(185);                  // 'namespace-node'
      break;
    case 191:                       // 'node'
      shiftT(191);                  // 'node'
      break;
    case 216:                       // 'processing-instruction'
      shiftT(216);                  // 'processing-instruction'
      break;
    case 226:                       // 'schema-attribute'
      shiftT(226);                  // 'schema-attribute'
      break;
    case 227:                       // 'schema-element'
      shiftT(227);                  // 'schema-element'
      break;
    case 243:                       // 'switch'
      shiftT(243);                  // 'switch'
      break;
    case 244:                       // 'text'
      shiftT(244);                  // 'text'
      break;
    case 253:                       // 'typeswitch'
      shiftT(253);                  // 'typeswitch'
      break;
    default:
      try_FunctionName();
    }
  }

  function parse_FunctionName()
  {
    eventHandler.startNonterminal("FunctionName", e0);
    switch (l1)
    {
    case 6:                         // EQName^Token
      shift(6);                     // EQName^Token
      break;
    case 70:                        // 'after'
      shift(70);                    // 'after'
      break;
    case 73:                        // 'ancestor'
      shift(73);                    // 'ancestor'
      break;
    case 74:                        // 'ancestor-or-self'
      shift(74);                    // 'ancestor-or-self'
      break;
    case 75:                        // 'and'
      shift(75);                    // 'and'
      break;
    case 79:                        // 'as'
      shift(79);                    // 'as'
      break;
    case 80:                        // 'ascending'
      shift(80);                    // 'ascending'
      break;
    case 84:                        // 'before'
      shift(84);                    // 'before'
      break;
    case 88:                        // 'case'
      shift(88);                    // 'case'
      break;
    case 89:                        // 'cast'
      shift(89);                    // 'cast'
      break;
    case 90:                        // 'castable'
      shift(90);                    // 'castable'
      break;
    case 93:                        // 'child'
      shift(93);                    // 'child'
      break;
    case 94:                        // 'collation'
      shift(94);                    // 'collation'
      break;
    case 103:                       // 'copy'
      shift(103);                   // 'copy'
      break;
    case 105:                       // 'count'
      shift(105);                   // 'count'
      break;
    case 108:                       // 'declare'
      shift(108);                   // 'declare'
      break;
    case 109:                       // 'default'
      shift(109);                   // 'default'
      break;
    case 110:                       // 'delete'
      shift(110);                   // 'delete'
      break;
    case 111:                       // 'descendant'
      shift(111);                   // 'descendant'
      break;
    case 112:                       // 'descendant-or-self'
      shift(112);                   // 'descendant-or-self'
      break;
    case 113:                       // 'descending'
      shift(113);                   // 'descending'
      break;
    case 118:                       // 'div'
      shift(118);                   // 'div'
      break;
    case 119:                       // 'document'
      shift(119);                   // 'document'
      break;
    case 122:                       // 'else'
      shift(122);                   // 'else'
      break;
    case 123:                       // 'empty'
      shift(123);                   // 'empty'
      break;
    case 126:                       // 'end'
      shift(126);                   // 'end'
      break;
    case 128:                       // 'eq'
      shift(128);                   // 'eq'
      break;
    case 129:                       // 'every'
      shift(129);                   // 'every'
      break;
    case 131:                       // 'except'
      shift(131);                   // 'except'
      break;
    case 134:                       // 'first'
      shift(134);                   // 'first'
      break;
    case 135:                       // 'following'
      shift(135);                   // 'following'
      break;
    case 136:                       // 'following-sibling'
      shift(136);                   // 'following-sibling'
      break;
    case 137:                       // 'for'
      shift(137);                   // 'for'
      break;
    case 146:                       // 'ge'
      shift(146);                   // 'ge'
      break;
    case 148:                       // 'group'
      shift(148);                   // 'group'
      break;
    case 150:                       // 'gt'
      shift(150);                   // 'gt'
      break;
    case 151:                       // 'idiv'
      shift(151);                   // 'idiv'
      break;
    case 153:                       // 'import'
      shift(153);                   // 'import'
      break;
    case 159:                       // 'insert'
      shift(159);                   // 'insert'
      break;
    case 160:                       // 'instance'
      shift(160);                   // 'instance'
      break;
    case 162:                       // 'intersect'
      shift(162);                   // 'intersect'
      break;
    case 163:                       // 'into'
      shift(163);                   // 'into'
      break;
    case 164:                       // 'is'
      shift(164);                   // 'is'
      break;
    case 170:                       // 'last'
      shift(170);                   // 'last'
      break;
    case 172:                       // 'le'
      shift(172);                   // 'le'
      break;
    case 174:                       // 'let'
      shift(174);                   // 'let'
      break;
    case 178:                       // 'lt'
      shift(178);                   // 'lt'
      break;
    case 180:                       // 'mod'
      shift(180);                   // 'mod'
      break;
    case 181:                       // 'modify'
      shift(181);                   // 'modify'
      break;
    case 182:                       // 'module'
      shift(182);                   // 'module'
      break;
    case 184:                       // 'namespace'
      shift(184);                   // 'namespace'
      break;
    case 186:                       // 'ne'
      shift(186);                   // 'ne'
      break;
    case 198:                       // 'only'
      shift(198);                   // 'only'
      break;
    case 200:                       // 'or'
      shift(200);                   // 'or'
      break;
    case 201:                       // 'order'
      shift(201);                   // 'order'
      break;
    case 202:                       // 'ordered'
      shift(202);                   // 'ordered'
      break;
    case 206:                       // 'parent'
      shift(206);                   // 'parent'
      break;
    case 212:                       // 'preceding'
      shift(212);                   // 'preceding'
      break;
    case 213:                       // 'preceding-sibling'
      shift(213);                   // 'preceding-sibling'
      break;
    case 218:                       // 'rename'
      shift(218);                   // 'rename'
      break;
    case 219:                       // 'replace'
      shift(219);                   // 'replace'
      break;
    case 220:                       // 'return'
      shift(220);                   // 'return'
      break;
    case 224:                       // 'satisfies'
      shift(224);                   // 'satisfies'
      break;
    case 229:                       // 'self'
      shift(229);                   // 'self'
      break;
    case 235:                       // 'some'
      shift(235);                   // 'some'
      break;
    case 236:                       // 'stable'
      shift(236);                   // 'stable'
      break;
    case 237:                       // 'start'
      shift(237);                   // 'start'
      break;
    case 248:                       // 'to'
      shift(248);                   // 'to'
      break;
    case 249:                       // 'treat'
      shift(249);                   // 'treat'
      break;
    case 250:                       // 'try'
      shift(250);                   // 'try'
      break;
    case 254:                       // 'union'
      shift(254);                   // 'union'
      break;
    case 256:                       // 'unordered'
      shift(256);                   // 'unordered'
      break;
    case 260:                       // 'validate'
      shift(260);                   // 'validate'
      break;
    case 266:                       // 'where'
      shift(266);                   // 'where'
      break;
    case 270:                       // 'with'
      shift(270);                   // 'with'
      break;
    case 274:                       // 'xquery'
      shift(274);                   // 'xquery'
      break;
    case 72:                        // 'allowing'
      shift(72);                    // 'allowing'
      break;
    case 81:                        // 'at'
      shift(81);                    // 'at'
      break;
    case 83:                        // 'base-uri'
      shift(83);                    // 'base-uri'
      break;
    case 85:                        // 'boundary-space'
      shift(85);                    // 'boundary-space'
      break;
    case 86:                        // 'break'
      shift(86);                    // 'break'
      break;
    case 91:                        // 'catch'
      shift(91);                    // 'catch'
      break;
    case 98:                        // 'construction'
      shift(98);                    // 'construction'
      break;
    case 101:                       // 'context'
      shift(101);                   // 'context'
      break;
    case 102:                       // 'continue'
      shift(102);                   // 'continue'
      break;
    case 104:                       // 'copy-namespaces'
      shift(104);                   // 'copy-namespaces'
      break;
    case 106:                       // 'decimal-format'
      shift(106);                   // 'decimal-format'
      break;
    case 125:                       // 'encoding'
      shift(125);                   // 'encoding'
      break;
    case 132:                       // 'exit'
      shift(132);                   // 'exit'
      break;
    case 133:                       // 'external'
      shift(133);                   // 'external'
      break;
    case 141:                       // 'ft-option'
      shift(141);                   // 'ft-option'
      break;
    case 154:                       // 'in'
      shift(154);                   // 'in'
      break;
    case 155:                       // 'index'
      shift(155);                   // 'index'
      break;
    case 161:                       // 'integrity'
      shift(161);                   // 'integrity'
      break;
    case 171:                       // 'lax'
      shift(171);                   // 'lax'
      break;
    case 192:                       // 'nodes'
      shift(192);                   // 'nodes'
      break;
    case 199:                       // 'option'
      shift(199);                   // 'option'
      break;
    case 203:                       // 'ordering'
      shift(203);                   // 'ordering'
      break;
    case 222:                       // 'revalidation'
      shift(222);                   // 'revalidation'
      break;
    case 225:                       // 'schema'
      shift(225);                   // 'schema'
      break;
    case 228:                       // 'score'
      shift(228);                   // 'score'
      break;
    case 234:                       // 'sliding'
      shift(234);                   // 'sliding'
      break;
    case 240:                       // 'strict'
      shift(240);                   // 'strict'
      break;
    case 251:                       // 'tumbling'
      shift(251);                   // 'tumbling'
      break;
    case 252:                       // 'type'
      shift(252);                   // 'type'
      break;
    case 257:                       // 'updating'
      shift(257);                   // 'updating'
      break;
    case 261:                       // 'value'
      shift(261);                   // 'value'
      break;
    case 262:                       // 'variable'
      shift(262);                   // 'variable'
      break;
    case 263:                       // 'version'
      shift(263);                   // 'version'
      break;
    case 267:                       // 'while'
      shift(267);                   // 'while'
      break;
    case 97:                        // 'constraint'
      shift(97);                    // 'constraint'
      break;
    case 176:                       // 'loop'
      shift(176);                   // 'loop'
      break;
    default:
      shift(221);                   // 'returning'
    }
    eventHandler.endNonterminal("FunctionName", e0);
  }

  function try_FunctionName()
  {
    switch (l1)
    {
    case 6:                         // EQName^Token
      shiftT(6);                    // EQName^Token
      break;
    case 70:                        // 'after'
      shiftT(70);                   // 'after'
      break;
    case 73:                        // 'ancestor'
      shiftT(73);                   // 'ancestor'
      break;
    case 74:                        // 'ancestor-or-self'
      shiftT(74);                   // 'ancestor-or-self'
      break;
    case 75:                        // 'and'
      shiftT(75);                   // 'and'
      break;
    case 79:                        // 'as'
      shiftT(79);                   // 'as'
      break;
    case 80:                        // 'ascending'
      shiftT(80);                   // 'ascending'
      break;
    case 84:                        // 'before'
      shiftT(84);                   // 'before'
      break;
    case 88:                        // 'case'
      shiftT(88);                   // 'case'
      break;
    case 89:                        // 'cast'
      shiftT(89);                   // 'cast'
      break;
    case 90:                        // 'castable'
      shiftT(90);                   // 'castable'
      break;
    case 93:                        // 'child'
      shiftT(93);                   // 'child'
      break;
    case 94:                        // 'collation'
      shiftT(94);                   // 'collation'
      break;
    case 103:                       // 'copy'
      shiftT(103);                  // 'copy'
      break;
    case 105:                       // 'count'
      shiftT(105);                  // 'count'
      break;
    case 108:                       // 'declare'
      shiftT(108);                  // 'declare'
      break;
    case 109:                       // 'default'
      shiftT(109);                  // 'default'
      break;
    case 110:                       // 'delete'
      shiftT(110);                  // 'delete'
      break;
    case 111:                       // 'descendant'
      shiftT(111);                  // 'descendant'
      break;
    case 112:                       // 'descendant-or-self'
      shiftT(112);                  // 'descendant-or-self'
      break;
    case 113:                       // 'descending'
      shiftT(113);                  // 'descending'
      break;
    case 118:                       // 'div'
      shiftT(118);                  // 'div'
      break;
    case 119:                       // 'document'
      shiftT(119);                  // 'document'
      break;
    case 122:                       // 'else'
      shiftT(122);                  // 'else'
      break;
    case 123:                       // 'empty'
      shiftT(123);                  // 'empty'
      break;
    case 126:                       // 'end'
      shiftT(126);                  // 'end'
      break;
    case 128:                       // 'eq'
      shiftT(128);                  // 'eq'
      break;
    case 129:                       // 'every'
      shiftT(129);                  // 'every'
      break;
    case 131:                       // 'except'
      shiftT(131);                  // 'except'
      break;
    case 134:                       // 'first'
      shiftT(134);                  // 'first'
      break;
    case 135:                       // 'following'
      shiftT(135);                  // 'following'
      break;
    case 136:                       // 'following-sibling'
      shiftT(136);                  // 'following-sibling'
      break;
    case 137:                       // 'for'
      shiftT(137);                  // 'for'
      break;
    case 146:                       // 'ge'
      shiftT(146);                  // 'ge'
      break;
    case 148:                       // 'group'
      shiftT(148);                  // 'group'
      break;
    case 150:                       // 'gt'
      shiftT(150);                  // 'gt'
      break;
    case 151:                       // 'idiv'
      shiftT(151);                  // 'idiv'
      break;
    case 153:                       // 'import'
      shiftT(153);                  // 'import'
      break;
    case 159:                       // 'insert'
      shiftT(159);                  // 'insert'
      break;
    case 160:                       // 'instance'
      shiftT(160);                  // 'instance'
      break;
    case 162:                       // 'intersect'
      shiftT(162);                  // 'intersect'
      break;
    case 163:                       // 'into'
      shiftT(163);                  // 'into'
      break;
    case 164:                       // 'is'
      shiftT(164);                  // 'is'
      break;
    case 170:                       // 'last'
      shiftT(170);                  // 'last'
      break;
    case 172:                       // 'le'
      shiftT(172);                  // 'le'
      break;
    case 174:                       // 'let'
      shiftT(174);                  // 'let'
      break;
    case 178:                       // 'lt'
      shiftT(178);                  // 'lt'
      break;
    case 180:                       // 'mod'
      shiftT(180);                  // 'mod'
      break;
    case 181:                       // 'modify'
      shiftT(181);                  // 'modify'
      break;
    case 182:                       // 'module'
      shiftT(182);                  // 'module'
      break;
    case 184:                       // 'namespace'
      shiftT(184);                  // 'namespace'
      break;
    case 186:                       // 'ne'
      shiftT(186);                  // 'ne'
      break;
    case 198:                       // 'only'
      shiftT(198);                  // 'only'
      break;
    case 200:                       // 'or'
      shiftT(200);                  // 'or'
      break;
    case 201:                       // 'order'
      shiftT(201);                  // 'order'
      break;
    case 202:                       // 'ordered'
      shiftT(202);                  // 'ordered'
      break;
    case 206:                       // 'parent'
      shiftT(206);                  // 'parent'
      break;
    case 212:                       // 'preceding'
      shiftT(212);                  // 'preceding'
      break;
    case 213:                       // 'preceding-sibling'
      shiftT(213);                  // 'preceding-sibling'
      break;
    case 218:                       // 'rename'
      shiftT(218);                  // 'rename'
      break;
    case 219:                       // 'replace'
      shiftT(219);                  // 'replace'
      break;
    case 220:                       // 'return'
      shiftT(220);                  // 'return'
      break;
    case 224:                       // 'satisfies'
      shiftT(224);                  // 'satisfies'
      break;
    case 229:                       // 'self'
      shiftT(229);                  // 'self'
      break;
    case 235:                       // 'some'
      shiftT(235);                  // 'some'
      break;
    case 236:                       // 'stable'
      shiftT(236);                  // 'stable'
      break;
    case 237:                       // 'start'
      shiftT(237);                  // 'start'
      break;
    case 248:                       // 'to'
      shiftT(248);                  // 'to'
      break;
    case 249:                       // 'treat'
      shiftT(249);                  // 'treat'
      break;
    case 250:                       // 'try'
      shiftT(250);                  // 'try'
      break;
    case 254:                       // 'union'
      shiftT(254);                  // 'union'
      break;
    case 256:                       // 'unordered'
      shiftT(256);                  // 'unordered'
      break;
    case 260:                       // 'validate'
      shiftT(260);                  // 'validate'
      break;
    case 266:                       // 'where'
      shiftT(266);                  // 'where'
      break;
    case 270:                       // 'with'
      shiftT(270);                  // 'with'
      break;
    case 274:                       // 'xquery'
      shiftT(274);                  // 'xquery'
      break;
    case 72:                        // 'allowing'
      shiftT(72);                   // 'allowing'
      break;
    case 81:                        // 'at'
      shiftT(81);                   // 'at'
      break;
    case 83:                        // 'base-uri'
      shiftT(83);                   // 'base-uri'
      break;
    case 85:                        // 'boundary-space'
      shiftT(85);                   // 'boundary-space'
      break;
    case 86:                        // 'break'
      shiftT(86);                   // 'break'
      break;
    case 91:                        // 'catch'
      shiftT(91);                   // 'catch'
      break;
    case 98:                        // 'construction'
      shiftT(98);                   // 'construction'
      break;
    case 101:                       // 'context'
      shiftT(101);                  // 'context'
      break;
    case 102:                       // 'continue'
      shiftT(102);                  // 'continue'
      break;
    case 104:                       // 'copy-namespaces'
      shiftT(104);                  // 'copy-namespaces'
      break;
    case 106:                       // 'decimal-format'
      shiftT(106);                  // 'decimal-format'
      break;
    case 125:                       // 'encoding'
      shiftT(125);                  // 'encoding'
      break;
    case 132:                       // 'exit'
      shiftT(132);                  // 'exit'
      break;
    case 133:                       // 'external'
      shiftT(133);                  // 'external'
      break;
    case 141:                       // 'ft-option'
      shiftT(141);                  // 'ft-option'
      break;
    case 154:                       // 'in'
      shiftT(154);                  // 'in'
      break;
    case 155:                       // 'index'
      shiftT(155);                  // 'index'
      break;
    case 161:                       // 'integrity'
      shiftT(161);                  // 'integrity'
      break;
    case 171:                       // 'lax'
      shiftT(171);                  // 'lax'
      break;
    case 192:                       // 'nodes'
      shiftT(192);                  // 'nodes'
      break;
    case 199:                       // 'option'
      shiftT(199);                  // 'option'
      break;
    case 203:                       // 'ordering'
      shiftT(203);                  // 'ordering'
      break;
    case 222:                       // 'revalidation'
      shiftT(222);                  // 'revalidation'
      break;
    case 225:                       // 'schema'
      shiftT(225);                  // 'schema'
      break;
    case 228:                       // 'score'
      shiftT(228);                  // 'score'
      break;
    case 234:                       // 'sliding'
      shiftT(234);                  // 'sliding'
      break;
    case 240:                       // 'strict'
      shiftT(240);                  // 'strict'
      break;
    case 251:                       // 'tumbling'
      shiftT(251);                  // 'tumbling'
      break;
    case 252:                       // 'type'
      shiftT(252);                  // 'type'
      break;
    case 257:                       // 'updating'
      shiftT(257);                  // 'updating'
      break;
    case 261:                       // 'value'
      shiftT(261);                  // 'value'
      break;
    case 262:                       // 'variable'
      shiftT(262);                  // 'variable'
      break;
    case 263:                       // 'version'
      shiftT(263);                  // 'version'
      break;
    case 267:                       // 'while'
      shiftT(267);                  // 'while'
      break;
    case 97:                        // 'constraint'
      shiftT(97);                   // 'constraint'
      break;
    case 176:                       // 'loop'
      shiftT(176);                  // 'loop'
      break;
    default:
      shiftT(221);                  // 'returning'
    }
  }

  function parse_NCName()
  {
    eventHandler.startNonterminal("NCName", e0);
    switch (l1)
    {
    case 19:                        // NCName^Token
      shift(19);                    // NCName^Token
      break;
    case 70:                        // 'after'
      shift(70);                    // 'after'
      break;
    case 75:                        // 'and'
      shift(75);                    // 'and'
      break;
    case 79:                        // 'as'
      shift(79);                    // 'as'
      break;
    case 80:                        // 'ascending'
      shift(80);                    // 'ascending'
      break;
    case 84:                        // 'before'
      shift(84);                    // 'before'
      break;
    case 88:                        // 'case'
      shift(88);                    // 'case'
      break;
    case 89:                        // 'cast'
      shift(89);                    // 'cast'
      break;
    case 90:                        // 'castable'
      shift(90);                    // 'castable'
      break;
    case 94:                        // 'collation'
      shift(94);                    // 'collation'
      break;
    case 105:                       // 'count'
      shift(105);                   // 'count'
      break;
    case 109:                       // 'default'
      shift(109);                   // 'default'
      break;
    case 113:                       // 'descending'
      shift(113);                   // 'descending'
      break;
    case 118:                       // 'div'
      shift(118);                   // 'div'
      break;
    case 122:                       // 'else'
      shift(122);                   // 'else'
      break;
    case 123:                       // 'empty'
      shift(123);                   // 'empty'
      break;
    case 126:                       // 'end'
      shift(126);                   // 'end'
      break;
    case 128:                       // 'eq'
      shift(128);                   // 'eq'
      break;
    case 131:                       // 'except'
      shift(131);                   // 'except'
      break;
    case 137:                       // 'for'
      shift(137);                   // 'for'
      break;
    case 146:                       // 'ge'
      shift(146);                   // 'ge'
      break;
    case 148:                       // 'group'
      shift(148);                   // 'group'
      break;
    case 150:                       // 'gt'
      shift(150);                   // 'gt'
      break;
    case 151:                       // 'idiv'
      shift(151);                   // 'idiv'
      break;
    case 160:                       // 'instance'
      shift(160);                   // 'instance'
      break;
    case 162:                       // 'intersect'
      shift(162);                   // 'intersect'
      break;
    case 163:                       // 'into'
      shift(163);                   // 'into'
      break;
    case 164:                       // 'is'
      shift(164);                   // 'is'
      break;
    case 172:                       // 'le'
      shift(172);                   // 'le'
      break;
    case 174:                       // 'let'
      shift(174);                   // 'let'
      break;
    case 178:                       // 'lt'
      shift(178);                   // 'lt'
      break;
    case 180:                       // 'mod'
      shift(180);                   // 'mod'
      break;
    case 181:                       // 'modify'
      shift(181);                   // 'modify'
      break;
    case 186:                       // 'ne'
      shift(186);                   // 'ne'
      break;
    case 198:                       // 'only'
      shift(198);                   // 'only'
      break;
    case 200:                       // 'or'
      shift(200);                   // 'or'
      break;
    case 201:                       // 'order'
      shift(201);                   // 'order'
      break;
    case 220:                       // 'return'
      shift(220);                   // 'return'
      break;
    case 224:                       // 'satisfies'
      shift(224);                   // 'satisfies'
      break;
    case 236:                       // 'stable'
      shift(236);                   // 'stable'
      break;
    case 237:                       // 'start'
      shift(237);                   // 'start'
      break;
    case 248:                       // 'to'
      shift(248);                   // 'to'
      break;
    case 249:                       // 'treat'
      shift(249);                   // 'treat'
      break;
    case 254:                       // 'union'
      shift(254);                   // 'union'
      break;
    case 266:                       // 'where'
      shift(266);                   // 'where'
      break;
    case 270:                       // 'with'
      shift(270);                   // 'with'
      break;
    case 73:                        // 'ancestor'
      shift(73);                    // 'ancestor'
      break;
    case 74:                        // 'ancestor-or-self'
      shift(74);                    // 'ancestor-or-self'
      break;
    case 82:                        // 'attribute'
      shift(82);                    // 'attribute'
      break;
    case 93:                        // 'child'
      shift(93);                    // 'child'
      break;
    case 96:                        // 'comment'
      shift(96);                    // 'comment'
      break;
    case 103:                       // 'copy'
      shift(103);                   // 'copy'
      break;
    case 108:                       // 'declare'
      shift(108);                   // 'declare'
      break;
    case 110:                       // 'delete'
      shift(110);                   // 'delete'
      break;
    case 111:                       // 'descendant'
      shift(111);                   // 'descendant'
      break;
    case 112:                       // 'descendant-or-self'
      shift(112);                   // 'descendant-or-self'
      break;
    case 119:                       // 'document'
      shift(119);                   // 'document'
      break;
    case 120:                       // 'document-node'
      shift(120);                   // 'document-node'
      break;
    case 121:                       // 'element'
      shift(121);                   // 'element'
      break;
    case 124:                       // 'empty-sequence'
      shift(124);                   // 'empty-sequence'
      break;
    case 129:                       // 'every'
      shift(129);                   // 'every'
      break;
    case 134:                       // 'first'
      shift(134);                   // 'first'
      break;
    case 135:                       // 'following'
      shift(135);                   // 'following'
      break;
    case 136:                       // 'following-sibling'
      shift(136);                   // 'following-sibling'
      break;
    case 145:                       // 'function'
      shift(145);                   // 'function'
      break;
    case 152:                       // 'if'
      shift(152);                   // 'if'
      break;
    case 153:                       // 'import'
      shift(153);                   // 'import'
      break;
    case 159:                       // 'insert'
      shift(159);                   // 'insert'
      break;
    case 165:                       // 'item'
      shift(165);                   // 'item'
      break;
    case 170:                       // 'last'
      shift(170);                   // 'last'
      break;
    case 182:                       // 'module'
      shift(182);                   // 'module'
      break;
    case 184:                       // 'namespace'
      shift(184);                   // 'namespace'
      break;
    case 185:                       // 'namespace-node'
      shift(185);                   // 'namespace-node'
      break;
    case 191:                       // 'node'
      shift(191);                   // 'node'
      break;
    case 202:                       // 'ordered'
      shift(202);                   // 'ordered'
      break;
    case 206:                       // 'parent'
      shift(206);                   // 'parent'
      break;
    case 212:                       // 'preceding'
      shift(212);                   // 'preceding'
      break;
    case 213:                       // 'preceding-sibling'
      shift(213);                   // 'preceding-sibling'
      break;
    case 216:                       // 'processing-instruction'
      shift(216);                   // 'processing-instruction'
      break;
    case 218:                       // 'rename'
      shift(218);                   // 'rename'
      break;
    case 219:                       // 'replace'
      shift(219);                   // 'replace'
      break;
    case 226:                       // 'schema-attribute'
      shift(226);                   // 'schema-attribute'
      break;
    case 227:                       // 'schema-element'
      shift(227);                   // 'schema-element'
      break;
    case 229:                       // 'self'
      shift(229);                   // 'self'
      break;
    case 235:                       // 'some'
      shift(235);                   // 'some'
      break;
    case 243:                       // 'switch'
      shift(243);                   // 'switch'
      break;
    case 244:                       // 'text'
      shift(244);                   // 'text'
      break;
    case 250:                       // 'try'
      shift(250);                   // 'try'
      break;
    case 253:                       // 'typeswitch'
      shift(253);                   // 'typeswitch'
      break;
    case 256:                       // 'unordered'
      shift(256);                   // 'unordered'
      break;
    case 260:                       // 'validate'
      shift(260);                   // 'validate'
      break;
    case 262:                       // 'variable'
      shift(262);                   // 'variable'
      break;
    case 274:                       // 'xquery'
      shift(274);                   // 'xquery'
      break;
    case 72:                        // 'allowing'
      shift(72);                    // 'allowing'
      break;
    case 81:                        // 'at'
      shift(81);                    // 'at'
      break;
    case 83:                        // 'base-uri'
      shift(83);                    // 'base-uri'
      break;
    case 85:                        // 'boundary-space'
      shift(85);                    // 'boundary-space'
      break;
    case 86:                        // 'break'
      shift(86);                    // 'break'
      break;
    case 91:                        // 'catch'
      shift(91);                    // 'catch'
      break;
    case 98:                        // 'construction'
      shift(98);                    // 'construction'
      break;
    case 101:                       // 'context'
      shift(101);                   // 'context'
      break;
    case 102:                       // 'continue'
      shift(102);                   // 'continue'
      break;
    case 104:                       // 'copy-namespaces'
      shift(104);                   // 'copy-namespaces'
      break;
    case 106:                       // 'decimal-format'
      shift(106);                   // 'decimal-format'
      break;
    case 125:                       // 'encoding'
      shift(125);                   // 'encoding'
      break;
    case 132:                       // 'exit'
      shift(132);                   // 'exit'
      break;
    case 133:                       // 'external'
      shift(133);                   // 'external'
      break;
    case 141:                       // 'ft-option'
      shift(141);                   // 'ft-option'
      break;
    case 154:                       // 'in'
      shift(154);                   // 'in'
      break;
    case 155:                       // 'index'
      shift(155);                   // 'index'
      break;
    case 161:                       // 'integrity'
      shift(161);                   // 'integrity'
      break;
    case 171:                       // 'lax'
      shift(171);                   // 'lax'
      break;
    case 192:                       // 'nodes'
      shift(192);                   // 'nodes'
      break;
    case 199:                       // 'option'
      shift(199);                   // 'option'
      break;
    case 203:                       // 'ordering'
      shift(203);                   // 'ordering'
      break;
    case 222:                       // 'revalidation'
      shift(222);                   // 'revalidation'
      break;
    case 225:                       // 'schema'
      shift(225);                   // 'schema'
      break;
    case 228:                       // 'score'
      shift(228);                   // 'score'
      break;
    case 234:                       // 'sliding'
      shift(234);                   // 'sliding'
      break;
    case 240:                       // 'strict'
      shift(240);                   // 'strict'
      break;
    case 251:                       // 'tumbling'
      shift(251);                   // 'tumbling'
      break;
    case 252:                       // 'type'
      shift(252);                   // 'type'
      break;
    case 257:                       // 'updating'
      shift(257);                   // 'updating'
      break;
    case 261:                       // 'value'
      shift(261);                   // 'value'
      break;
    case 263:                       // 'version'
      shift(263);                   // 'version'
      break;
    case 267:                       // 'while'
      shift(267);                   // 'while'
      break;
    case 97:                        // 'constraint'
      shift(97);                    // 'constraint'
      break;
    case 176:                       // 'loop'
      shift(176);                   // 'loop'
      break;
    default:
      shift(221);                   // 'returning'
    }
    eventHandler.endNonterminal("NCName", e0);
  }

  function try_NCName()
  {
    switch (l1)
    {
    case 19:                        // NCName^Token
      shiftT(19);                   // NCName^Token
      break;
    case 70:                        // 'after'
      shiftT(70);                   // 'after'
      break;
    case 75:                        // 'and'
      shiftT(75);                   // 'and'
      break;
    case 79:                        // 'as'
      shiftT(79);                   // 'as'
      break;
    case 80:                        // 'ascending'
      shiftT(80);                   // 'ascending'
      break;
    case 84:                        // 'before'
      shiftT(84);                   // 'before'
      break;
    case 88:                        // 'case'
      shiftT(88);                   // 'case'
      break;
    case 89:                        // 'cast'
      shiftT(89);                   // 'cast'
      break;
    case 90:                        // 'castable'
      shiftT(90);                   // 'castable'
      break;
    case 94:                        // 'collation'
      shiftT(94);                   // 'collation'
      break;
    case 105:                       // 'count'
      shiftT(105);                  // 'count'
      break;
    case 109:                       // 'default'
      shiftT(109);                  // 'default'
      break;
    case 113:                       // 'descending'
      shiftT(113);                  // 'descending'
      break;
    case 118:                       // 'div'
      shiftT(118);                  // 'div'
      break;
    case 122:                       // 'else'
      shiftT(122);                  // 'else'
      break;
    case 123:                       // 'empty'
      shiftT(123);                  // 'empty'
      break;
    case 126:                       // 'end'
      shiftT(126);                  // 'end'
      break;
    case 128:                       // 'eq'
      shiftT(128);                  // 'eq'
      break;
    case 131:                       // 'except'
      shiftT(131);                  // 'except'
      break;
    case 137:                       // 'for'
      shiftT(137);                  // 'for'
      break;
    case 146:                       // 'ge'
      shiftT(146);                  // 'ge'
      break;
    case 148:                       // 'group'
      shiftT(148);                  // 'group'
      break;
    case 150:                       // 'gt'
      shiftT(150);                  // 'gt'
      break;
    case 151:                       // 'idiv'
      shiftT(151);                  // 'idiv'
      break;
    case 160:                       // 'instance'
      shiftT(160);                  // 'instance'
      break;
    case 162:                       // 'intersect'
      shiftT(162);                  // 'intersect'
      break;
    case 163:                       // 'into'
      shiftT(163);                  // 'into'
      break;
    case 164:                       // 'is'
      shiftT(164);                  // 'is'
      break;
    case 172:                       // 'le'
      shiftT(172);                  // 'le'
      break;
    case 174:                       // 'let'
      shiftT(174);                  // 'let'
      break;
    case 178:                       // 'lt'
      shiftT(178);                  // 'lt'
      break;
    case 180:                       // 'mod'
      shiftT(180);                  // 'mod'
      break;
    case 181:                       // 'modify'
      shiftT(181);                  // 'modify'
      break;
    case 186:                       // 'ne'
      shiftT(186);                  // 'ne'
      break;
    case 198:                       // 'only'
      shiftT(198);                  // 'only'
      break;
    case 200:                       // 'or'
      shiftT(200);                  // 'or'
      break;
    case 201:                       // 'order'
      shiftT(201);                  // 'order'
      break;
    case 220:                       // 'return'
      shiftT(220);                  // 'return'
      break;
    case 224:                       // 'satisfies'
      shiftT(224);                  // 'satisfies'
      break;
    case 236:                       // 'stable'
      shiftT(236);                  // 'stable'
      break;
    case 237:                       // 'start'
      shiftT(237);                  // 'start'
      break;
    case 248:                       // 'to'
      shiftT(248);                  // 'to'
      break;
    case 249:                       // 'treat'
      shiftT(249);                  // 'treat'
      break;
    case 254:                       // 'union'
      shiftT(254);                  // 'union'
      break;
    case 266:                       // 'where'
      shiftT(266);                  // 'where'
      break;
    case 270:                       // 'with'
      shiftT(270);                  // 'with'
      break;
    case 73:                        // 'ancestor'
      shiftT(73);                   // 'ancestor'
      break;
    case 74:                        // 'ancestor-or-self'
      shiftT(74);                   // 'ancestor-or-self'
      break;
    case 82:                        // 'attribute'
      shiftT(82);                   // 'attribute'
      break;
    case 93:                        // 'child'
      shiftT(93);                   // 'child'
      break;
    case 96:                        // 'comment'
      shiftT(96);                   // 'comment'
      break;
    case 103:                       // 'copy'
      shiftT(103);                  // 'copy'
      break;
    case 108:                       // 'declare'
      shiftT(108);                  // 'declare'
      break;
    case 110:                       // 'delete'
      shiftT(110);                  // 'delete'
      break;
    case 111:                       // 'descendant'
      shiftT(111);                  // 'descendant'
      break;
    case 112:                       // 'descendant-or-self'
      shiftT(112);                  // 'descendant-or-self'
      break;
    case 119:                       // 'document'
      shiftT(119);                  // 'document'
      break;
    case 120:                       // 'document-node'
      shiftT(120);                  // 'document-node'
      break;
    case 121:                       // 'element'
      shiftT(121);                  // 'element'
      break;
    case 124:                       // 'empty-sequence'
      shiftT(124);                  // 'empty-sequence'
      break;
    case 129:                       // 'every'
      shiftT(129);                  // 'every'
      break;
    case 134:                       // 'first'
      shiftT(134);                  // 'first'
      break;
    case 135:                       // 'following'
      shiftT(135);                  // 'following'
      break;
    case 136:                       // 'following-sibling'
      shiftT(136);                  // 'following-sibling'
      break;
    case 145:                       // 'function'
      shiftT(145);                  // 'function'
      break;
    case 152:                       // 'if'
      shiftT(152);                  // 'if'
      break;
    case 153:                       // 'import'
      shiftT(153);                  // 'import'
      break;
    case 159:                       // 'insert'
      shiftT(159);                  // 'insert'
      break;
    case 165:                       // 'item'
      shiftT(165);                  // 'item'
      break;
    case 170:                       // 'last'
      shiftT(170);                  // 'last'
      break;
    case 182:                       // 'module'
      shiftT(182);                  // 'module'
      break;
    case 184:                       // 'namespace'
      shiftT(184);                  // 'namespace'
      break;
    case 185:                       // 'namespace-node'
      shiftT(185);                  // 'namespace-node'
      break;
    case 191:                       // 'node'
      shiftT(191);                  // 'node'
      break;
    case 202:                       // 'ordered'
      shiftT(202);                  // 'ordered'
      break;
    case 206:                       // 'parent'
      shiftT(206);                  // 'parent'
      break;
    case 212:                       // 'preceding'
      shiftT(212);                  // 'preceding'
      break;
    case 213:                       // 'preceding-sibling'
      shiftT(213);                  // 'preceding-sibling'
      break;
    case 216:                       // 'processing-instruction'
      shiftT(216);                  // 'processing-instruction'
      break;
    case 218:                       // 'rename'
      shiftT(218);                  // 'rename'
      break;
    case 219:                       // 'replace'
      shiftT(219);                  // 'replace'
      break;
    case 226:                       // 'schema-attribute'
      shiftT(226);                  // 'schema-attribute'
      break;
    case 227:                       // 'schema-element'
      shiftT(227);                  // 'schema-element'
      break;
    case 229:                       // 'self'
      shiftT(229);                  // 'self'
      break;
    case 235:                       // 'some'
      shiftT(235);                  // 'some'
      break;
    case 243:                       // 'switch'
      shiftT(243);                  // 'switch'
      break;
    case 244:                       // 'text'
      shiftT(244);                  // 'text'
      break;
    case 250:                       // 'try'
      shiftT(250);                  // 'try'
      break;
    case 253:                       // 'typeswitch'
      shiftT(253);                  // 'typeswitch'
      break;
    case 256:                       // 'unordered'
      shiftT(256);                  // 'unordered'
      break;
    case 260:                       // 'validate'
      shiftT(260);                  // 'validate'
      break;
    case 262:                       // 'variable'
      shiftT(262);                  // 'variable'
      break;
    case 274:                       // 'xquery'
      shiftT(274);                  // 'xquery'
      break;
    case 72:                        // 'allowing'
      shiftT(72);                   // 'allowing'
      break;
    case 81:                        // 'at'
      shiftT(81);                   // 'at'
      break;
    case 83:                        // 'base-uri'
      shiftT(83);                   // 'base-uri'
      break;
    case 85:                        // 'boundary-space'
      shiftT(85);                   // 'boundary-space'
      break;
    case 86:                        // 'break'
      shiftT(86);                   // 'break'
      break;
    case 91:                        // 'catch'
      shiftT(91);                   // 'catch'
      break;
    case 98:                        // 'construction'
      shiftT(98);                   // 'construction'
      break;
    case 101:                       // 'context'
      shiftT(101);                  // 'context'
      break;
    case 102:                       // 'continue'
      shiftT(102);                  // 'continue'
      break;
    case 104:                       // 'copy-namespaces'
      shiftT(104);                  // 'copy-namespaces'
      break;
    case 106:                       // 'decimal-format'
      shiftT(106);                  // 'decimal-format'
      break;
    case 125:                       // 'encoding'
      shiftT(125);                  // 'encoding'
      break;
    case 132:                       // 'exit'
      shiftT(132);                  // 'exit'
      break;
    case 133:                       // 'external'
      shiftT(133);                  // 'external'
      break;
    case 141:                       // 'ft-option'
      shiftT(141);                  // 'ft-option'
      break;
    case 154:                       // 'in'
      shiftT(154);                  // 'in'
      break;
    case 155:                       // 'index'
      shiftT(155);                  // 'index'
      break;
    case 161:                       // 'integrity'
      shiftT(161);                  // 'integrity'
      break;
    case 171:                       // 'lax'
      shiftT(171);                  // 'lax'
      break;
    case 192:                       // 'nodes'
      shiftT(192);                  // 'nodes'
      break;
    case 199:                       // 'option'
      shiftT(199);                  // 'option'
      break;
    case 203:                       // 'ordering'
      shiftT(203);                  // 'ordering'
      break;
    case 222:                       // 'revalidation'
      shiftT(222);                  // 'revalidation'
      break;
    case 225:                       // 'schema'
      shiftT(225);                  // 'schema'
      break;
    case 228:                       // 'score'
      shiftT(228);                  // 'score'
      break;
    case 234:                       // 'sliding'
      shiftT(234);                  // 'sliding'
      break;
    case 240:                       // 'strict'
      shiftT(240);                  // 'strict'
      break;
    case 251:                       // 'tumbling'
      shiftT(251);                  // 'tumbling'
      break;
    case 252:                       // 'type'
      shiftT(252);                  // 'type'
      break;
    case 257:                       // 'updating'
      shiftT(257);                  // 'updating'
      break;
    case 261:                       // 'value'
      shiftT(261);                  // 'value'
      break;
    case 263:                       // 'version'
      shiftT(263);                  // 'version'
      break;
    case 267:                       // 'while'
      shiftT(267);                  // 'while'
      break;
    case 97:                        // 'constraint'
      shiftT(97);                   // 'constraint'
      break;
    case 176:                       // 'loop'
      shiftT(176);                  // 'loop'
      break;
    default:
      shiftT(221);                  // 'returning'
    }
  }

  function parse_MainModule()
  {
    eventHandler.startNonterminal("MainModule", e0);
    parse_Prolog();
    whitespace();
    parse_Program();
    eventHandler.endNonterminal("MainModule", e0);
  }

  function parse_Program()
  {
    eventHandler.startNonterminal("Program", e0);
    parse_StatementsAndOptionalExpr();
    eventHandler.endNonterminal("Program", e0);
  }

  function parse_Statements()
  {
    eventHandler.startNonterminal("Statements", e0);
    for (;;)
    {
      lookahead1W(273);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      switch (l1)
      {
      case 34:                      // '('
        lookahead2W(268);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 35:                      // '(#'
        lookahead2(248);            // EQName^Token | S | 'after' | 'allowing' | 'ancestor' | 'ancestor-or-self' |
        break;
      case 46:                      // '/'
        lookahead2W(281);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 47:                      // '//'
        lookahead2W(263);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 54:                      // '<'
        lookahead2(4);              // QName
        break;
      case 55:                      // '<!--'
        lookahead2(1);              // DirCommentContents
        break;
      case 59:                      // '<?'
        lookahead2(3);              // PITarget
        break;
      case 66:                      // '@'
        lookahead2W(251);           // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        break;
      case 68:                      // '['
        lookahead2W(270);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 77:                      // 'append'
        lookahead2W(56);            // S^WS | '(:' | 'json'
        break;
      case 82:                      // 'attribute'
        lookahead2W(278);           // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' |
        break;
      case 121:                     // 'element'
        lookahead2W(276);           // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' |
        break;
      case 132:                     // 'exit'
        lookahead2W(202);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 137:                     // 'for'
        lookahead2W(206);           // S^WS | EOF | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 174:                     // 'let'
        lookahead2W(204);           // S^WS | EOF | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 218:                     // 'rename'
        lookahead2W(205);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 219:                     // 'replace'
        lookahead2W(208);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 260:                     // 'validate'
        lookahead2W(209);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 276:                     // '{'
        lookahead2W(272);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 278:                     // '{|'
        lookahead2W(271);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 5:                       // Wildcard
      case 45:                      // '..'
        lookahead2W(186);           // S^WS | EOF | '!' | '!=' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' | ';' | '<' |
        break;
      case 31:                      // '$'
      case 32:                      // '%'
        lookahead2W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        break;
      case 40:                      // '+'
      case 42:                      // '-'
        lookahead2W(265);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 86:                      // 'break'
      case 102:                     // 'continue'
        lookahead2W(200);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 110:                     // 'delete'
      case 159:                     // 'insert'
        lookahead2W(207);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 124:                     // 'empty-sequence'
      case 165:                     // 'item'
        lookahead2W(191);           // S^WS | EOF | '!' | '!=' | '#' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' | ';' |
        break;
      case 184:                     // 'namespace'
      case 216:                     // 'processing-instruction'
        lookahead2W(277);           // NCName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' |
        break;
      case 103:                     // 'copy'
      case 129:                     // 'every'
      case 235:                     // 'some'
      case 262:                     // 'variable'
        lookahead2W(197);           // S^WS | EOF | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 8:                       // IntegerLiteral
      case 9:                       // DecimalLiteral
      case 10:                      // DoubleLiteral
      case 11:                      // StringLiteral
      case 44:                      // '.'
        lookahead2W(192);           // S^WS | EOF | '!' | '!=' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' | ';' |
        break;
      case 96:                      // 'comment'
      case 119:                     // 'document'
      case 202:                     // 'ordered'
      case 244:                     // 'text'
      case 250:                     // 'try'
      case 256:                     // 'unordered'
        lookahead2W(203);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 73:                      // 'ancestor'
      case 74:                      // 'ancestor-or-self'
      case 93:                      // 'child'
      case 111:                     // 'descendant'
      case 112:                     // 'descendant-or-self'
      case 135:                     // 'following'
      case 136:                     // 'following-sibling'
      case 206:                     // 'parent'
      case 212:                     // 'preceding'
      case 213:                     // 'preceding-sibling'
      case 229:                     // 'self'
        lookahead2W(198);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 6:                       // EQName^Token
      case 70:                      // 'after'
      case 72:                      // 'allowing'
      case 75:                      // 'and'
      case 79:                      // 'as'
      case 80:                      // 'ascending'
      case 81:                      // 'at'
      case 83:                      // 'base-uri'
      case 84:                      // 'before'
      case 85:                      // 'boundary-space'
      case 88:                      // 'case'
      case 89:                      // 'cast'
      case 90:                      // 'castable'
      case 91:                      // 'catch'
      case 94:                      // 'collation'
      case 97:                      // 'constraint'
      case 98:                      // 'construction'
      case 101:                     // 'context'
      case 104:                     // 'copy-namespaces'
      case 105:                     // 'count'
      case 106:                     // 'decimal-format'
      case 108:                     // 'declare'
      case 109:                     // 'default'
      case 113:                     // 'descending'
      case 118:                     // 'div'
      case 120:                     // 'document-node'
      case 122:                     // 'else'
      case 123:                     // 'empty'
      case 125:                     // 'encoding'
      case 126:                     // 'end'
      case 128:                     // 'eq'
      case 131:                     // 'except'
      case 133:                     // 'external'
      case 134:                     // 'first'
      case 141:                     // 'ft-option'
      case 145:                     // 'function'
      case 146:                     // 'ge'
      case 148:                     // 'group'
      case 150:                     // 'gt'
      case 151:                     // 'idiv'
      case 152:                     // 'if'
      case 153:                     // 'import'
      case 154:                     // 'in'
      case 155:                     // 'index'
      case 160:                     // 'instance'
      case 161:                     // 'integrity'
      case 162:                     // 'intersect'
      case 163:                     // 'into'
      case 164:                     // 'is'
      case 170:                     // 'last'
      case 171:                     // 'lax'
      case 172:                     // 'le'
      case 176:                     // 'loop'
      case 178:                     // 'lt'
      case 180:                     // 'mod'
      case 181:                     // 'modify'
      case 182:                     // 'module'
      case 185:                     // 'namespace-node'
      case 186:                     // 'ne'
      case 191:                     // 'node'
      case 192:                     // 'nodes'
      case 198:                     // 'only'
      case 199:                     // 'option'
      case 200:                     // 'or'
      case 201:                     // 'order'
      case 203:                     // 'ordering'
      case 220:                     // 'return'
      case 221:                     // 'returning'
      case 222:                     // 'revalidation'
      case 224:                     // 'satisfies'
      case 225:                     // 'schema'
      case 226:                     // 'schema-attribute'
      case 227:                     // 'schema-element'
      case 228:                     // 'score'
      case 234:                     // 'sliding'
      case 236:                     // 'stable'
      case 237:                     // 'start'
      case 240:                     // 'strict'
      case 243:                     // 'switch'
      case 248:                     // 'to'
      case 249:                     // 'treat'
      case 251:                     // 'tumbling'
      case 252:                     // 'type'
      case 253:                     // 'typeswitch'
      case 254:                     // 'union'
      case 257:                     // 'updating'
      case 261:                     // 'value'
      case 263:                     // 'version'
      case 266:                     // 'where'
      case 267:                     // 'while'
      case 270:                     // 'with'
      case 274:                     // 'xquery'
        lookahead2W(195);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      default:
        lk = l1;
      }
      if (lk != 25                  // EOF
       && lk != 282                 // '}'
       && lk != 12805               // Wildcard EOF
       && lk != 12806               // EQName^Token EOF
       && lk != 12808               // IntegerLiteral EOF
       && lk != 12809               // DecimalLiteral EOF
       && lk != 12810               // DoubleLiteral EOF
       && lk != 12811               // StringLiteral EOF
       && lk != 12844               // '.' EOF
       && lk != 12845               // '..' EOF
       && lk != 12846               // '/' EOF
       && lk != 12870               // 'after' EOF
       && lk != 12872               // 'allowing' EOF
       && lk != 12873               // 'ancestor' EOF
       && lk != 12874               // 'ancestor-or-self' EOF
       && lk != 12875               // 'and' EOF
       && lk != 12879               // 'as' EOF
       && lk != 12880               // 'ascending' EOF
       && lk != 12881               // 'at' EOF
       && lk != 12882               // 'attribute' EOF
       && lk != 12883               // 'base-uri' EOF
       && lk != 12884               // 'before' EOF
       && lk != 12885               // 'boundary-space' EOF
       && lk != 12886               // 'break' EOF
       && lk != 12888               // 'case' EOF
       && lk != 12889               // 'cast' EOF
       && lk != 12890               // 'castable' EOF
       && lk != 12891               // 'catch' EOF
       && lk != 12893               // 'child' EOF
       && lk != 12894               // 'collation' EOF
       && lk != 12896               // 'comment' EOF
       && lk != 12897               // 'constraint' EOF
       && lk != 12898               // 'construction' EOF
       && lk != 12901               // 'context' EOF
       && lk != 12902               // 'continue' EOF
       && lk != 12903               // 'copy' EOF
       && lk != 12904               // 'copy-namespaces' EOF
       && lk != 12905               // 'count' EOF
       && lk != 12906               // 'decimal-format' EOF
       && lk != 12908               // 'declare' EOF
       && lk != 12909               // 'default' EOF
       && lk != 12910               // 'delete' EOF
       && lk != 12911               // 'descendant' EOF
       && lk != 12912               // 'descendant-or-self' EOF
       && lk != 12913               // 'descending' EOF
       && lk != 12918               // 'div' EOF
       && lk != 12919               // 'document' EOF
       && lk != 12920               // 'document-node' EOF
       && lk != 12921               // 'element' EOF
       && lk != 12922               // 'else' EOF
       && lk != 12923               // 'empty' EOF
       && lk != 12924               // 'empty-sequence' EOF
       && lk != 12925               // 'encoding' EOF
       && lk != 12926               // 'end' EOF
       && lk != 12928               // 'eq' EOF
       && lk != 12929               // 'every' EOF
       && lk != 12931               // 'except' EOF
       && lk != 12932               // 'exit' EOF
       && lk != 12933               // 'external' EOF
       && lk != 12934               // 'first' EOF
       && lk != 12935               // 'following' EOF
       && lk != 12936               // 'following-sibling' EOF
       && lk != 12937               // 'for' EOF
       && lk != 12941               // 'ft-option' EOF
       && lk != 12945               // 'function' EOF
       && lk != 12946               // 'ge' EOF
       && lk != 12948               // 'group' EOF
       && lk != 12950               // 'gt' EOF
       && lk != 12951               // 'idiv' EOF
       && lk != 12952               // 'if' EOF
       && lk != 12953               // 'import' EOF
       && lk != 12954               // 'in' EOF
       && lk != 12955               // 'index' EOF
       && lk != 12959               // 'insert' EOF
       && lk != 12960               // 'instance' EOF
       && lk != 12961               // 'integrity' EOF
       && lk != 12962               // 'intersect' EOF
       && lk != 12963               // 'into' EOF
       && lk != 12964               // 'is' EOF
       && lk != 12965               // 'item' EOF
       && lk != 12970               // 'last' EOF
       && lk != 12971               // 'lax' EOF
       && lk != 12972               // 'le' EOF
       && lk != 12974               // 'let' EOF
       && lk != 12976               // 'loop' EOF
       && lk != 12978               // 'lt' EOF
       && lk != 12980               // 'mod' EOF
       && lk != 12981               // 'modify' EOF
       && lk != 12982               // 'module' EOF
       && lk != 12984               // 'namespace' EOF
       && lk != 12985               // 'namespace-node' EOF
       && lk != 12986               // 'ne' EOF
       && lk != 12991               // 'node' EOF
       && lk != 12992               // 'nodes' EOF
       && lk != 12998               // 'only' EOF
       && lk != 12999               // 'option' EOF
       && lk != 13000               // 'or' EOF
       && lk != 13001               // 'order' EOF
       && lk != 13002               // 'ordered' EOF
       && lk != 13003               // 'ordering' EOF
       && lk != 13006               // 'parent' EOF
       && lk != 13012               // 'preceding' EOF
       && lk != 13013               // 'preceding-sibling' EOF
       && lk != 13016               // 'processing-instruction' EOF
       && lk != 13018               // 'rename' EOF
       && lk != 13019               // 'replace' EOF
       && lk != 13020               // 'return' EOF
       && lk != 13021               // 'returning' EOF
       && lk != 13022               // 'revalidation' EOF
       && lk != 13024               // 'satisfies' EOF
       && lk != 13025               // 'schema' EOF
       && lk != 13026               // 'schema-attribute' EOF
       && lk != 13027               // 'schema-element' EOF
       && lk != 13028               // 'score' EOF
       && lk != 13029               // 'self' EOF
       && lk != 13034               // 'sliding' EOF
       && lk != 13035               // 'some' EOF
       && lk != 13036               // 'stable' EOF
       && lk != 13037               // 'start' EOF
       && lk != 13040               // 'strict' EOF
       && lk != 13043               // 'switch' EOF
       && lk != 13044               // 'text' EOF
       && lk != 13048               // 'to' EOF
       && lk != 13049               // 'treat' EOF
       && lk != 13050               // 'try' EOF
       && lk != 13051               // 'tumbling' EOF
       && lk != 13052               // 'type' EOF
       && lk != 13053               // 'typeswitch' EOF
       && lk != 13054               // 'union' EOF
       && lk != 13056               // 'unordered' EOF
       && lk != 13057               // 'updating' EOF
       && lk != 13060               // 'validate' EOF
       && lk != 13061               // 'value' EOF
       && lk != 13062               // 'variable' EOF
       && lk != 13063               // 'version' EOF
       && lk != 13066               // 'where' EOF
       && lk != 13067               // 'while' EOF
       && lk != 13070               // 'with' EOF
       && lk != 13074               // 'xquery' EOF
       && lk != 16134               // 'variable' '$'
       && lk != 20997               // Wildcard ','
       && lk != 20998               // EQName^Token ','
       && lk != 21000               // IntegerLiteral ','
       && lk != 21001               // DecimalLiteral ','
       && lk != 21002               // DoubleLiteral ','
       && lk != 21003               // StringLiteral ','
       && lk != 21036               // '.' ','
       && lk != 21037               // '..' ','
       && lk != 21038               // '/' ','
       && lk != 21062               // 'after' ','
       && lk != 21064               // 'allowing' ','
       && lk != 21065               // 'ancestor' ','
       && lk != 21066               // 'ancestor-or-self' ','
       && lk != 21067               // 'and' ','
       && lk != 21071               // 'as' ','
       && lk != 21072               // 'ascending' ','
       && lk != 21073               // 'at' ','
       && lk != 21074               // 'attribute' ','
       && lk != 21075               // 'base-uri' ','
       && lk != 21076               // 'before' ','
       && lk != 21077               // 'boundary-space' ','
       && lk != 21078               // 'break' ','
       && lk != 21080               // 'case' ','
       && lk != 21081               // 'cast' ','
       && lk != 21082               // 'castable' ','
       && lk != 21083               // 'catch' ','
       && lk != 21085               // 'child' ','
       && lk != 21086               // 'collation' ','
       && lk != 21088               // 'comment' ','
       && lk != 21089               // 'constraint' ','
       && lk != 21090               // 'construction' ','
       && lk != 21093               // 'context' ','
       && lk != 21094               // 'continue' ','
       && lk != 21095               // 'copy' ','
       && lk != 21096               // 'copy-namespaces' ','
       && lk != 21097               // 'count' ','
       && lk != 21098               // 'decimal-format' ','
       && lk != 21100               // 'declare' ','
       && lk != 21101               // 'default' ','
       && lk != 21102               // 'delete' ','
       && lk != 21103               // 'descendant' ','
       && lk != 21104               // 'descendant-or-self' ','
       && lk != 21105               // 'descending' ','
       && lk != 21110               // 'div' ','
       && lk != 21111               // 'document' ','
       && lk != 21112               // 'document-node' ','
       && lk != 21113               // 'element' ','
       && lk != 21114               // 'else' ','
       && lk != 21115               // 'empty' ','
       && lk != 21116               // 'empty-sequence' ','
       && lk != 21117               // 'encoding' ','
       && lk != 21118               // 'end' ','
       && lk != 21120               // 'eq' ','
       && lk != 21121               // 'every' ','
       && lk != 21123               // 'except' ','
       && lk != 21124               // 'exit' ','
       && lk != 21125               // 'external' ','
       && lk != 21126               // 'first' ','
       && lk != 21127               // 'following' ','
       && lk != 21128               // 'following-sibling' ','
       && lk != 21129               // 'for' ','
       && lk != 21133               // 'ft-option' ','
       && lk != 21137               // 'function' ','
       && lk != 21138               // 'ge' ','
       && lk != 21140               // 'group' ','
       && lk != 21142               // 'gt' ','
       && lk != 21143               // 'idiv' ','
       && lk != 21144               // 'if' ','
       && lk != 21145               // 'import' ','
       && lk != 21146               // 'in' ','
       && lk != 21147               // 'index' ','
       && lk != 21151               // 'insert' ','
       && lk != 21152               // 'instance' ','
       && lk != 21153               // 'integrity' ','
       && lk != 21154               // 'intersect' ','
       && lk != 21155               // 'into' ','
       && lk != 21156               // 'is' ','
       && lk != 21157               // 'item' ','
       && lk != 21162               // 'last' ','
       && lk != 21163               // 'lax' ','
       && lk != 21164               // 'le' ','
       && lk != 21166               // 'let' ','
       && lk != 21168               // 'loop' ','
       && lk != 21170               // 'lt' ','
       && lk != 21172               // 'mod' ','
       && lk != 21173               // 'modify' ','
       && lk != 21174               // 'module' ','
       && lk != 21176               // 'namespace' ','
       && lk != 21177               // 'namespace-node' ','
       && lk != 21178               // 'ne' ','
       && lk != 21183               // 'node' ','
       && lk != 21184               // 'nodes' ','
       && lk != 21190               // 'only' ','
       && lk != 21191               // 'option' ','
       && lk != 21192               // 'or' ','
       && lk != 21193               // 'order' ','
       && lk != 21194               // 'ordered' ','
       && lk != 21195               // 'ordering' ','
       && lk != 21198               // 'parent' ','
       && lk != 21204               // 'preceding' ','
       && lk != 21205               // 'preceding-sibling' ','
       && lk != 21208               // 'processing-instruction' ','
       && lk != 21210               // 'rename' ','
       && lk != 21211               // 'replace' ','
       && lk != 21212               // 'return' ','
       && lk != 21213               // 'returning' ','
       && lk != 21214               // 'revalidation' ','
       && lk != 21216               // 'satisfies' ','
       && lk != 21217               // 'schema' ','
       && lk != 21218               // 'schema-attribute' ','
       && lk != 21219               // 'schema-element' ','
       && lk != 21220               // 'score' ','
       && lk != 21221               // 'self' ','
       && lk != 21226               // 'sliding' ','
       && lk != 21227               // 'some' ','
       && lk != 21228               // 'stable' ','
       && lk != 21229               // 'start' ','
       && lk != 21232               // 'strict' ','
       && lk != 21235               // 'switch' ','
       && lk != 21236               // 'text' ','
       && lk != 21240               // 'to' ','
       && lk != 21241               // 'treat' ','
       && lk != 21242               // 'try' ','
       && lk != 21243               // 'tumbling' ','
       && lk != 21244               // 'type' ','
       && lk != 21245               // 'typeswitch' ','
       && lk != 21246               // 'union' ','
       && lk != 21248               // 'unordered' ','
       && lk != 21249               // 'updating' ','
       && lk != 21252               // 'validate' ','
       && lk != 21253               // 'value' ','
       && lk != 21254               // 'variable' ','
       && lk != 21255               // 'version' ','
       && lk != 21258               // 'where' ','
       && lk != 21259               // 'while' ','
       && lk != 21262               // 'with' ','
       && lk != 21266               // 'xquery' ','
       && lk != 27141               // Wildcard ';'
       && lk != 27142               // EQName^Token ';'
       && lk != 27144               // IntegerLiteral ';'
       && lk != 27145               // DecimalLiteral ';'
       && lk != 27146               // DoubleLiteral ';'
       && lk != 27147               // StringLiteral ';'
       && lk != 27180               // '.' ';'
       && lk != 27181               // '..' ';'
       && lk != 27182               // '/' ';'
       && lk != 27206               // 'after' ';'
       && lk != 27208               // 'allowing' ';'
       && lk != 27209               // 'ancestor' ';'
       && lk != 27210               // 'ancestor-or-self' ';'
       && lk != 27211               // 'and' ';'
       && lk != 27215               // 'as' ';'
       && lk != 27216               // 'ascending' ';'
       && lk != 27217               // 'at' ';'
       && lk != 27218               // 'attribute' ';'
       && lk != 27219               // 'base-uri' ';'
       && lk != 27220               // 'before' ';'
       && lk != 27221               // 'boundary-space' ';'
       && lk != 27222               // 'break' ';'
       && lk != 27224               // 'case' ';'
       && lk != 27225               // 'cast' ';'
       && lk != 27226               // 'castable' ';'
       && lk != 27227               // 'catch' ';'
       && lk != 27229               // 'child' ';'
       && lk != 27230               // 'collation' ';'
       && lk != 27232               // 'comment' ';'
       && lk != 27233               // 'constraint' ';'
       && lk != 27234               // 'construction' ';'
       && lk != 27237               // 'context' ';'
       && lk != 27238               // 'continue' ';'
       && lk != 27239               // 'copy' ';'
       && lk != 27240               // 'copy-namespaces' ';'
       && lk != 27241               // 'count' ';'
       && lk != 27242               // 'decimal-format' ';'
       && lk != 27244               // 'declare' ';'
       && lk != 27245               // 'default' ';'
       && lk != 27246               // 'delete' ';'
       && lk != 27247               // 'descendant' ';'
       && lk != 27248               // 'descendant-or-self' ';'
       && lk != 27249               // 'descending' ';'
       && lk != 27254               // 'div' ';'
       && lk != 27255               // 'document' ';'
       && lk != 27256               // 'document-node' ';'
       && lk != 27257               // 'element' ';'
       && lk != 27258               // 'else' ';'
       && lk != 27259               // 'empty' ';'
       && lk != 27260               // 'empty-sequence' ';'
       && lk != 27261               // 'encoding' ';'
       && lk != 27262               // 'end' ';'
       && lk != 27264               // 'eq' ';'
       && lk != 27265               // 'every' ';'
       && lk != 27267               // 'except' ';'
       && lk != 27268               // 'exit' ';'
       && lk != 27269               // 'external' ';'
       && lk != 27270               // 'first' ';'
       && lk != 27271               // 'following' ';'
       && lk != 27272               // 'following-sibling' ';'
       && lk != 27273               // 'for' ';'
       && lk != 27277               // 'ft-option' ';'
       && lk != 27281               // 'function' ';'
       && lk != 27282               // 'ge' ';'
       && lk != 27284               // 'group' ';'
       && lk != 27286               // 'gt' ';'
       && lk != 27287               // 'idiv' ';'
       && lk != 27288               // 'if' ';'
       && lk != 27289               // 'import' ';'
       && lk != 27290               // 'in' ';'
       && lk != 27291               // 'index' ';'
       && lk != 27295               // 'insert' ';'
       && lk != 27296               // 'instance' ';'
       && lk != 27297               // 'integrity' ';'
       && lk != 27298               // 'intersect' ';'
       && lk != 27299               // 'into' ';'
       && lk != 27300               // 'is' ';'
       && lk != 27301               // 'item' ';'
       && lk != 27306               // 'last' ';'
       && lk != 27307               // 'lax' ';'
       && lk != 27308               // 'le' ';'
       && lk != 27310               // 'let' ';'
       && lk != 27312               // 'loop' ';'
       && lk != 27314               // 'lt' ';'
       && lk != 27316               // 'mod' ';'
       && lk != 27317               // 'modify' ';'
       && lk != 27318               // 'module' ';'
       && lk != 27320               // 'namespace' ';'
       && lk != 27321               // 'namespace-node' ';'
       && lk != 27322               // 'ne' ';'
       && lk != 27327               // 'node' ';'
       && lk != 27328               // 'nodes' ';'
       && lk != 27334               // 'only' ';'
       && lk != 27335               // 'option' ';'
       && lk != 27336               // 'or' ';'
       && lk != 27337               // 'order' ';'
       && lk != 27338               // 'ordered' ';'
       && lk != 27339               // 'ordering' ';'
       && lk != 27342               // 'parent' ';'
       && lk != 27348               // 'preceding' ';'
       && lk != 27349               // 'preceding-sibling' ';'
       && lk != 27352               // 'processing-instruction' ';'
       && lk != 27354               // 'rename' ';'
       && lk != 27355               // 'replace' ';'
       && lk != 27356               // 'return' ';'
       && lk != 27357               // 'returning' ';'
       && lk != 27358               // 'revalidation' ';'
       && lk != 27360               // 'satisfies' ';'
       && lk != 27361               // 'schema' ';'
       && lk != 27362               // 'schema-attribute' ';'
       && lk != 27363               // 'schema-element' ';'
       && lk != 27364               // 'score' ';'
       && lk != 27365               // 'self' ';'
       && lk != 27370               // 'sliding' ';'
       && lk != 27371               // 'some' ';'
       && lk != 27372               // 'stable' ';'
       && lk != 27373               // 'start' ';'
       && lk != 27376               // 'strict' ';'
       && lk != 27379               // 'switch' ';'
       && lk != 27380               // 'text' ';'
       && lk != 27384               // 'to' ';'
       && lk != 27385               // 'treat' ';'
       && lk != 27386               // 'try' ';'
       && lk != 27387               // 'tumbling' ';'
       && lk != 27388               // 'type' ';'
       && lk != 27389               // 'typeswitch' ';'
       && lk != 27390               // 'union' ';'
       && lk != 27392               // 'unordered' ';'
       && lk != 27393               // 'updating' ';'
       && lk != 27396               // 'validate' ';'
       && lk != 27397               // 'value' ';'
       && lk != 27398               // 'variable' ';'
       && lk != 27399               // 'version' ';'
       && lk != 27402               // 'where' ';'
       && lk != 27403               // 'while' ';'
       && lk != 27406               // 'with' ';'
       && lk != 27410               // 'xquery' ';'
       && lk != 90198               // 'break' 'loop'
       && lk != 90214               // 'continue' 'loop'
       && lk != 113284              // 'exit' 'returning'
       && lk != 144389              // Wildcard '}'
       && lk != 144390              // EQName^Token '}'
       && lk != 144392              // IntegerLiteral '}'
       && lk != 144393              // DecimalLiteral '}'
       && lk != 144394              // DoubleLiteral '}'
       && lk != 144395              // StringLiteral '}'
       && lk != 144428              // '.' '}'
       && lk != 144429              // '..' '}'
       && lk != 144430              // '/' '}'
       && lk != 144454              // 'after' '}'
       && lk != 144456              // 'allowing' '}'
       && lk != 144457              // 'ancestor' '}'
       && lk != 144458              // 'ancestor-or-self' '}'
       && lk != 144459              // 'and' '}'
       && lk != 144463              // 'as' '}'
       && lk != 144464              // 'ascending' '}'
       && lk != 144465              // 'at' '}'
       && lk != 144466              // 'attribute' '}'
       && lk != 144467              // 'base-uri' '}'
       && lk != 144468              // 'before' '}'
       && lk != 144469              // 'boundary-space' '}'
       && lk != 144470              // 'break' '}'
       && lk != 144472              // 'case' '}'
       && lk != 144473              // 'cast' '}'
       && lk != 144474              // 'castable' '}'
       && lk != 144475              // 'catch' '}'
       && lk != 144477              // 'child' '}'
       && lk != 144478              // 'collation' '}'
       && lk != 144480              // 'comment' '}'
       && lk != 144481              // 'constraint' '}'
       && lk != 144482              // 'construction' '}'
       && lk != 144485              // 'context' '}'
       && lk != 144486              // 'continue' '}'
       && lk != 144487              // 'copy' '}'
       && lk != 144488              // 'copy-namespaces' '}'
       && lk != 144489              // 'count' '}'
       && lk != 144490              // 'decimal-format' '}'
       && lk != 144492              // 'declare' '}'
       && lk != 144493              // 'default' '}'
       && lk != 144494              // 'delete' '}'
       && lk != 144495              // 'descendant' '}'
       && lk != 144496              // 'descendant-or-self' '}'
       && lk != 144497              // 'descending' '}'
       && lk != 144502              // 'div' '}'
       && lk != 144503              // 'document' '}'
       && lk != 144504              // 'document-node' '}'
       && lk != 144505              // 'element' '}'
       && lk != 144506              // 'else' '}'
       && lk != 144507              // 'empty' '}'
       && lk != 144508              // 'empty-sequence' '}'
       && lk != 144509              // 'encoding' '}'
       && lk != 144510              // 'end' '}'
       && lk != 144512              // 'eq' '}'
       && lk != 144513              // 'every' '}'
       && lk != 144515              // 'except' '}'
       && lk != 144516              // 'exit' '}'
       && lk != 144517              // 'external' '}'
       && lk != 144518              // 'first' '}'
       && lk != 144519              // 'following' '}'
       && lk != 144520              // 'following-sibling' '}'
       && lk != 144521              // 'for' '}'
       && lk != 144525              // 'ft-option' '}'
       && lk != 144529              // 'function' '}'
       && lk != 144530              // 'ge' '}'
       && lk != 144532              // 'group' '}'
       && lk != 144534              // 'gt' '}'
       && lk != 144535              // 'idiv' '}'
       && lk != 144536              // 'if' '}'
       && lk != 144537              // 'import' '}'
       && lk != 144538              // 'in' '}'
       && lk != 144539              // 'index' '}'
       && lk != 144543              // 'insert' '}'
       && lk != 144544              // 'instance' '}'
       && lk != 144545              // 'integrity' '}'
       && lk != 144546              // 'intersect' '}'
       && lk != 144547              // 'into' '}'
       && lk != 144548              // 'is' '}'
       && lk != 144549              // 'item' '}'
       && lk != 144554              // 'last' '}'
       && lk != 144555              // 'lax' '}'
       && lk != 144556              // 'le' '}'
       && lk != 144558              // 'let' '}'
       && lk != 144560              // 'loop' '}'
       && lk != 144562              // 'lt' '}'
       && lk != 144564              // 'mod' '}'
       && lk != 144565              // 'modify' '}'
       && lk != 144566              // 'module' '}'
       && lk != 144568              // 'namespace' '}'
       && lk != 144569              // 'namespace-node' '}'
       && lk != 144570              // 'ne' '}'
       && lk != 144575              // 'node' '}'
       && lk != 144576              // 'nodes' '}'
       && lk != 144582              // 'only' '}'
       && lk != 144583              // 'option' '}'
       && lk != 144584              // 'or' '}'
       && lk != 144585              // 'order' '}'
       && lk != 144586              // 'ordered' '}'
       && lk != 144587              // 'ordering' '}'
       && lk != 144590              // 'parent' '}'
       && lk != 144596              // 'preceding' '}'
       && lk != 144597              // 'preceding-sibling' '}'
       && lk != 144600              // 'processing-instruction' '}'
       && lk != 144602              // 'rename' '}'
       && lk != 144603              // 'replace' '}'
       && lk != 144604              // 'return' '}'
       && lk != 144605              // 'returning' '}'
       && lk != 144606              // 'revalidation' '}'
       && lk != 144608              // 'satisfies' '}'
       && lk != 144609              // 'schema' '}'
       && lk != 144610              // 'schema-attribute' '}'
       && lk != 144611              // 'schema-element' '}'
       && lk != 144612              // 'score' '}'
       && lk != 144613              // 'self' '}'
       && lk != 144618              // 'sliding' '}'
       && lk != 144619              // 'some' '}'
       && lk != 144620              // 'stable' '}'
       && lk != 144621              // 'start' '}'
       && lk != 144624              // 'strict' '}'
       && lk != 144627              // 'switch' '}'
       && lk != 144628              // 'text' '}'
       && lk != 144632              // 'to' '}'
       && lk != 144633              // 'treat' '}'
       && lk != 144634              // 'try' '}'
       && lk != 144635              // 'tumbling' '}'
       && lk != 144636              // 'type' '}'
       && lk != 144637              // 'typeswitch' '}'
       && lk != 144638              // 'union' '}'
       && lk != 144640              // 'unordered' '}'
       && lk != 144641              // 'updating' '}'
       && lk != 144644              // 'validate' '}'
       && lk != 144645              // 'value' '}'
       && lk != 144646              // 'variable' '}'
       && lk != 144647              // 'version' '}'
       && lk != 144650              // 'where' '}'
       && lk != 144651              // 'while' '}'
       && lk != 144654              // 'with' '}'
       && lk != 144658)             // 'xquery' '}'
      {
        lk = memoized(5, e0);
        if (lk == 0)
        {
          var b0A = b0; var e0A = e0; var l1A = l1;
          var b1A = b1; var e1A = e1; var l2A = l2;
          var b2A = b2; var e2A = e2;
          try
          {
            try_Statement();
            lk = -1;
          }
          catch (p1A)
          {
            lk = -2;
          }
          b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
          b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
          b2 = b2A; e2 = e2A; end = e2A; }}
          memoize(5, e0, lk);
        }
      }
      if (lk != -1
       && lk != 16134               // 'variable' '$'
       && lk != 27141               // Wildcard ';'
       && lk != 27142               // EQName^Token ';'
       && lk != 27144               // IntegerLiteral ';'
       && lk != 27145               // DecimalLiteral ';'
       && lk != 27146               // DoubleLiteral ';'
       && lk != 27147               // StringLiteral ';'
       && lk != 27180               // '.' ';'
       && lk != 27181               // '..' ';'
       && lk != 27182               // '/' ';'
       && lk != 27206               // 'after' ';'
       && lk != 27208               // 'allowing' ';'
       && lk != 27209               // 'ancestor' ';'
       && lk != 27210               // 'ancestor-or-self' ';'
       && lk != 27211               // 'and' ';'
       && lk != 27215               // 'as' ';'
       && lk != 27216               // 'ascending' ';'
       && lk != 27217               // 'at' ';'
       && lk != 27218               // 'attribute' ';'
       && lk != 27219               // 'base-uri' ';'
       && lk != 27220               // 'before' ';'
       && lk != 27221               // 'boundary-space' ';'
       && lk != 27222               // 'break' ';'
       && lk != 27224               // 'case' ';'
       && lk != 27225               // 'cast' ';'
       && lk != 27226               // 'castable' ';'
       && lk != 27227               // 'catch' ';'
       && lk != 27229               // 'child' ';'
       && lk != 27230               // 'collation' ';'
       && lk != 27232               // 'comment' ';'
       && lk != 27233               // 'constraint' ';'
       && lk != 27234               // 'construction' ';'
       && lk != 27237               // 'context' ';'
       && lk != 27238               // 'continue' ';'
       && lk != 27239               // 'copy' ';'
       && lk != 27240               // 'copy-namespaces' ';'
       && lk != 27241               // 'count' ';'
       && lk != 27242               // 'decimal-format' ';'
       && lk != 27244               // 'declare' ';'
       && lk != 27245               // 'default' ';'
       && lk != 27246               // 'delete' ';'
       && lk != 27247               // 'descendant' ';'
       && lk != 27248               // 'descendant-or-self' ';'
       && lk != 27249               // 'descending' ';'
       && lk != 27254               // 'div' ';'
       && lk != 27255               // 'document' ';'
       && lk != 27256               // 'document-node' ';'
       && lk != 27257               // 'element' ';'
       && lk != 27258               // 'else' ';'
       && lk != 27259               // 'empty' ';'
       && lk != 27260               // 'empty-sequence' ';'
       && lk != 27261               // 'encoding' ';'
       && lk != 27262               // 'end' ';'
       && lk != 27264               // 'eq' ';'
       && lk != 27265               // 'every' ';'
       && lk != 27267               // 'except' ';'
       && lk != 27268               // 'exit' ';'
       && lk != 27269               // 'external' ';'
       && lk != 27270               // 'first' ';'
       && lk != 27271               // 'following' ';'
       && lk != 27272               // 'following-sibling' ';'
       && lk != 27273               // 'for' ';'
       && lk != 27277               // 'ft-option' ';'
       && lk != 27281               // 'function' ';'
       && lk != 27282               // 'ge' ';'
       && lk != 27284               // 'group' ';'
       && lk != 27286               // 'gt' ';'
       && lk != 27287               // 'idiv' ';'
       && lk != 27288               // 'if' ';'
       && lk != 27289               // 'import' ';'
       && lk != 27290               // 'in' ';'
       && lk != 27291               // 'index' ';'
       && lk != 27295               // 'insert' ';'
       && lk != 27296               // 'instance' ';'
       && lk != 27297               // 'integrity' ';'
       && lk != 27298               // 'intersect' ';'
       && lk != 27299               // 'into' ';'
       && lk != 27300               // 'is' ';'
       && lk != 27301               // 'item' ';'
       && lk != 27306               // 'last' ';'
       && lk != 27307               // 'lax' ';'
       && lk != 27308               // 'le' ';'
       && lk != 27310               // 'let' ';'
       && lk != 27312               // 'loop' ';'
       && lk != 27314               // 'lt' ';'
       && lk != 27316               // 'mod' ';'
       && lk != 27317               // 'modify' ';'
       && lk != 27318               // 'module' ';'
       && lk != 27320               // 'namespace' ';'
       && lk != 27321               // 'namespace-node' ';'
       && lk != 27322               // 'ne' ';'
       && lk != 27327               // 'node' ';'
       && lk != 27328               // 'nodes' ';'
       && lk != 27334               // 'only' ';'
       && lk != 27335               // 'option' ';'
       && lk != 27336               // 'or' ';'
       && lk != 27337               // 'order' ';'
       && lk != 27338               // 'ordered' ';'
       && lk != 27339               // 'ordering' ';'
       && lk != 27342               // 'parent' ';'
       && lk != 27348               // 'preceding' ';'
       && lk != 27349               // 'preceding-sibling' ';'
       && lk != 27352               // 'processing-instruction' ';'
       && lk != 27354               // 'rename' ';'
       && lk != 27355               // 'replace' ';'
       && lk != 27356               // 'return' ';'
       && lk != 27357               // 'returning' ';'
       && lk != 27358               // 'revalidation' ';'
       && lk != 27360               // 'satisfies' ';'
       && lk != 27361               // 'schema' ';'
       && lk != 27362               // 'schema-attribute' ';'
       && lk != 27363               // 'schema-element' ';'
       && lk != 27364               // 'score' ';'
       && lk != 27365               // 'self' ';'
       && lk != 27370               // 'sliding' ';'
       && lk != 27371               // 'some' ';'
       && lk != 27372               // 'stable' ';'
       && lk != 27373               // 'start' ';'
       && lk != 27376               // 'strict' ';'
       && lk != 27379               // 'switch' ';'
       && lk != 27380               // 'text' ';'
       && lk != 27384               // 'to' ';'
       && lk != 27385               // 'treat' ';'
       && lk != 27386               // 'try' ';'
       && lk != 27387               // 'tumbling' ';'
       && lk != 27388               // 'type' ';'
       && lk != 27389               // 'typeswitch' ';'
       && lk != 27390               // 'union' ';'
       && lk != 27392               // 'unordered' ';'
       && lk != 27393               // 'updating' ';'
       && lk != 27396               // 'validate' ';'
       && lk != 27397               // 'value' ';'
       && lk != 27398               // 'variable' ';'
       && lk != 27399               // 'version' ';'
       && lk != 27402               // 'where' ';'
       && lk != 27403               // 'while' ';'
       && lk != 27406               // 'with' ';'
       && lk != 27410               // 'xquery' ';'
       && lk != 90198               // 'break' 'loop'
       && lk != 90214               // 'continue' 'loop'
       && lk != 113284)             // 'exit' 'returning'
      {
        break;
      }
      whitespace();
      parse_Statement();
    }
    eventHandler.endNonterminal("Statements", e0);
  }

  function try_Statements()
  {
    for (;;)
    {
      lookahead1W(273);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      switch (l1)
      {
      case 34:                      // '('
        lookahead2W(268);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 35:                      // '(#'
        lookahead2(248);            // EQName^Token | S | 'after' | 'allowing' | 'ancestor' | 'ancestor-or-self' |
        break;
      case 46:                      // '/'
        lookahead2W(281);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 47:                      // '//'
        lookahead2W(263);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 54:                      // '<'
        lookahead2(4);              // QName
        break;
      case 55:                      // '<!--'
        lookahead2(1);              // DirCommentContents
        break;
      case 59:                      // '<?'
        lookahead2(3);              // PITarget
        break;
      case 66:                      // '@'
        lookahead2W(251);           // Wildcard | EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        break;
      case 68:                      // '['
        lookahead2W(270);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 77:                      // 'append'
        lookahead2W(56);            // S^WS | '(:' | 'json'
        break;
      case 82:                      // 'attribute'
        lookahead2W(278);           // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' |
        break;
      case 121:                     // 'element'
        lookahead2W(276);           // EQName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' |
        break;
      case 132:                     // 'exit'
        lookahead2W(202);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 137:                     // 'for'
        lookahead2W(206);           // S^WS | EOF | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 174:                     // 'let'
        lookahead2W(204);           // S^WS | EOF | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 218:                     // 'rename'
        lookahead2W(205);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 219:                     // 'replace'
        lookahead2W(208);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 260:                     // 'validate'
        lookahead2W(209);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 276:                     // '{'
        lookahead2W(272);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 278:                     // '{|'
        lookahead2W(271);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 5:                       // Wildcard
      case 45:                      // '..'
        lookahead2W(186);           // S^WS | EOF | '!' | '!=' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' | ';' | '<' |
        break;
      case 31:                      // '$'
      case 32:                      // '%'
        lookahead2W(249);           // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
        break;
      case 40:                      // '+'
      case 42:                      // '-'
        lookahead2W(265);           // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
        break;
      case 86:                      // 'break'
      case 102:                     // 'continue'
        lookahead2W(200);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 110:                     // 'delete'
      case 159:                     // 'insert'
        lookahead2W(207);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 124:                     // 'empty-sequence'
      case 165:                     // 'item'
        lookahead2W(191);           // S^WS | EOF | '!' | '!=' | '#' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' | ';' |
        break;
      case 184:                     // 'namespace'
      case 216:                     // 'processing-instruction'
        lookahead2W(277);           // NCName^Token | S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' |
        break;
      case 103:                     // 'copy'
      case 129:                     // 'every'
      case 235:                     // 'some'
      case 262:                     // 'variable'
        lookahead2W(197);           // S^WS | EOF | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' |
        break;
      case 8:                       // IntegerLiteral
      case 9:                       // DecimalLiteral
      case 10:                      // DoubleLiteral
      case 11:                      // StringLiteral
      case 44:                      // '.'
        lookahead2W(192);           // S^WS | EOF | '!' | '!=' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' | ';' |
        break;
      case 96:                      // 'comment'
      case 119:                     // 'document'
      case 202:                     // 'ordered'
      case 244:                     // 'text'
      case 250:                     // 'try'
      case 256:                     // 'unordered'
        lookahead2W(203);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 73:                      // 'ancestor'
      case 74:                      // 'ancestor-or-self'
      case 93:                      // 'child'
      case 111:                     // 'descendant'
      case 112:                     // 'descendant-or-self'
      case 135:                     // 'following'
      case 136:                     // 'following-sibling'
      case 206:                     // 'parent'
      case 212:                     // 'preceding'
      case 213:                     // 'preceding-sibling'
      case 229:                     // 'self'
        lookahead2W(198);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      case 6:                       // EQName^Token
      case 70:                      // 'after'
      case 72:                      // 'allowing'
      case 75:                      // 'and'
      case 79:                      // 'as'
      case 80:                      // 'ascending'
      case 81:                      // 'at'
      case 83:                      // 'base-uri'
      case 84:                      // 'before'
      case 85:                      // 'boundary-space'
      case 88:                      // 'case'
      case 89:                      // 'cast'
      case 90:                      // 'castable'
      case 91:                      // 'catch'
      case 94:                      // 'collation'
      case 97:                      // 'constraint'
      case 98:                      // 'construction'
      case 101:                     // 'context'
      case 104:                     // 'copy-namespaces'
      case 105:                     // 'count'
      case 106:                     // 'decimal-format'
      case 108:                     // 'declare'
      case 109:                     // 'default'
      case 113:                     // 'descending'
      case 118:                     // 'div'
      case 120:                     // 'document-node'
      case 122:                     // 'else'
      case 123:                     // 'empty'
      case 125:                     // 'encoding'
      case 126:                     // 'end'
      case 128:                     // 'eq'
      case 131:                     // 'except'
      case 133:                     // 'external'
      case 134:                     // 'first'
      case 141:                     // 'ft-option'
      case 145:                     // 'function'
      case 146:                     // 'ge'
      case 148:                     // 'group'
      case 150:                     // 'gt'
      case 151:                     // 'idiv'
      case 152:                     // 'if'
      case 153:                     // 'import'
      case 154:                     // 'in'
      case 155:                     // 'index'
      case 160:                     // 'instance'
      case 161:                     // 'integrity'
      case 162:                     // 'intersect'
      case 163:                     // 'into'
      case 164:                     // 'is'
      case 170:                     // 'last'
      case 171:                     // 'lax'
      case 172:                     // 'le'
      case 176:                     // 'loop'
      case 178:                     // 'lt'
      case 180:                     // 'mod'
      case 181:                     // 'modify'
      case 182:                     // 'module'
      case 185:                     // 'namespace-node'
      case 186:                     // 'ne'
      case 191:                     // 'node'
      case 192:                     // 'nodes'
      case 198:                     // 'only'
      case 199:                     // 'option'
      case 200:                     // 'or'
      case 201:                     // 'order'
      case 203:                     // 'ordering'
      case 220:                     // 'return'
      case 221:                     // 'returning'
      case 222:                     // 'revalidation'
      case 224:                     // 'satisfies'
      case 225:                     // 'schema'
      case 226:                     // 'schema-attribute'
      case 227:                     // 'schema-element'
      case 228:                     // 'score'
      case 234:                     // 'sliding'
      case 236:                     // 'stable'
      case 237:                     // 'start'
      case 240:                     // 'strict'
      case 243:                     // 'switch'
      case 248:                     // 'to'
      case 249:                     // 'treat'
      case 251:                     // 'tumbling'
      case 252:                     // 'type'
      case 253:                     // 'typeswitch'
      case 254:                     // 'union'
      case 257:                     // 'updating'
      case 261:                     // 'value'
      case 263:                     // 'version'
      case 266:                     // 'where'
      case 267:                     // 'while'
      case 270:                     // 'with'
      case 274:                     // 'xquery'
        lookahead2W(195);           // S^WS | EOF | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | ',' | '-' | '/' | '//' |
        break;
      default:
        lk = l1;
      }
      if (lk != 25                  // EOF
       && lk != 282                 // '}'
       && lk != 12805               // Wildcard EOF
       && lk != 12806               // EQName^Token EOF
       && lk != 12808               // IntegerLiteral EOF
       && lk != 12809               // DecimalLiteral EOF
       && lk != 12810               // DoubleLiteral EOF
       && lk != 12811               // StringLiteral EOF
       && lk != 12844               // '.' EOF
       && lk != 12845               // '..' EOF
       && lk != 12846               // '/' EOF
       && lk != 12870               // 'after' EOF
       && lk != 12872               // 'allowing' EOF
       && lk != 12873               // 'ancestor' EOF
       && lk != 12874               // 'ancestor-or-self' EOF
       && lk != 12875               // 'and' EOF
       && lk != 12879               // 'as' EOF
       && lk != 12880               // 'ascending' EOF
       && lk != 12881               // 'at' EOF
       && lk != 12882               // 'attribute' EOF
       && lk != 12883               // 'base-uri' EOF
       && lk != 12884               // 'before' EOF
       && lk != 12885               // 'boundary-space' EOF
       && lk != 12886               // 'break' EOF
       && lk != 12888               // 'case' EOF
       && lk != 12889               // 'cast' EOF
       && lk != 12890               // 'castable' EOF
       && lk != 12891               // 'catch' EOF
       && lk != 12893               // 'child' EOF
       && lk != 12894               // 'collation' EOF
       && lk != 12896               // 'comment' EOF
       && lk != 12897               // 'constraint' EOF
       && lk != 12898               // 'construction' EOF
       && lk != 12901               // 'context' EOF
       && lk != 12902               // 'continue' EOF
       && lk != 12903               // 'copy' EOF
       && lk != 12904               // 'copy-namespaces' EOF
       && lk != 12905               // 'count' EOF
       && lk != 12906               // 'decimal-format' EOF
       && lk != 12908               // 'declare' EOF
       && lk != 12909               // 'default' EOF
       && lk != 12910               // 'delete' EOF
       && lk != 12911               // 'descendant' EOF
       && lk != 12912               // 'descendant-or-self' EOF
       && lk != 12913               // 'descending' EOF
       && lk != 12918               // 'div' EOF
       && lk != 12919               // 'document' EOF
       && lk != 12920               // 'document-node' EOF
       && lk != 12921               // 'element' EOF
       && lk != 12922               // 'else' EOF
       && lk != 12923               // 'empty' EOF
       && lk != 12924               // 'empty-sequence' EOF
       && lk != 12925               // 'encoding' EOF
       && lk != 12926               // 'end' EOF
       && lk != 12928               // 'eq' EOF
       && lk != 12929               // 'every' EOF
       && lk != 12931               // 'except' EOF
       && lk != 12932               // 'exit' EOF
       && lk != 12933               // 'external' EOF
       && lk != 12934               // 'first' EOF
       && lk != 12935               // 'following' EOF
       && lk != 12936               // 'following-sibling' EOF
       && lk != 12937               // 'for' EOF
       && lk != 12941               // 'ft-option' EOF
       && lk != 12945               // 'function' EOF
       && lk != 12946               // 'ge' EOF
       && lk != 12948               // 'group' EOF
       && lk != 12950               // 'gt' EOF
       && lk != 12951               // 'idiv' EOF
       && lk != 12952               // 'if' EOF
       && lk != 12953               // 'import' EOF
       && lk != 12954               // 'in' EOF
       && lk != 12955               // 'index' EOF
       && lk != 12959               // 'insert' EOF
       && lk != 12960               // 'instance' EOF
       && lk != 12961               // 'integrity' EOF
       && lk != 12962               // 'intersect' EOF
       && lk != 12963               // 'into' EOF
       && lk != 12964               // 'is' EOF
       && lk != 12965               // 'item' EOF
       && lk != 12970               // 'last' EOF
       && lk != 12971               // 'lax' EOF
       && lk != 12972               // 'le' EOF
       && lk != 12974               // 'let' EOF
       && lk != 12976               // 'loop' EOF
       && lk != 12978               // 'lt' EOF
       && lk != 12980               // 'mod' EOF
       && lk != 12981               // 'modify' EOF
       && lk != 12982               // 'module' EOF
       && lk != 12984               // 'namespace' EOF
       && lk != 12985               // 'namespace-node' EOF
       && lk != 12986               // 'ne' EOF
       && lk != 12991               // 'node' EOF
       && lk != 12992               // 'nodes' EOF
       && lk != 12998               // 'only' EOF
       && lk != 12999               // 'option' EOF
       && lk != 13000               // 'or' EOF
       && lk != 13001               // 'order' EOF
       && lk != 13002               // 'ordered' EOF
       && lk != 13003               // 'ordering' EOF
       && lk != 13006               // 'parent' EOF
       && lk != 13012               // 'preceding' EOF
       && lk != 13013               // 'preceding-sibling' EOF
       && lk != 13016               // 'processing-instruction' EOF
       && lk != 13018               // 'rename' EOF
       && lk != 13019               // 'replace' EOF
       && lk != 13020               // 'return' EOF
       && lk != 13021               // 'returning' EOF
       && lk != 13022               // 'revalidation' EOF
       && lk != 13024               // 'satisfies' EOF
       && lk != 13025               // 'schema' EOF
       && lk != 13026               // 'schema-attribute' EOF
       && lk != 13027               // 'schema-element' EOF
       && lk != 13028               // 'score' EOF
       && lk != 13029               // 'self' EOF
       && lk != 13034               // 'sliding' EOF
       && lk != 13035               // 'some' EOF
       && lk != 13036               // 'stable' EOF
       && lk != 13037               // 'start' EOF
       && lk != 13040               // 'strict' EOF
       && lk != 13043               // 'switch' EOF
       && lk != 13044               // 'text' EOF
       && lk != 13048               // 'to' EOF
       && lk != 13049               // 'treat' EOF
       && lk != 13050               // 'try' EOF
       && lk != 13051               // 'tumbling' EOF
       && lk != 13052               // 'type' EOF
       && lk != 13053               // 'typeswitch' EOF
       && lk != 13054               // 'union' EOF
       && lk != 13056               // 'unordered' EOF
       && lk != 13057               // 'updating' EOF
       && lk != 13060               // 'validate' EOF
       && lk != 13061               // 'value' EOF
       && lk != 13062               // 'variable' EOF
       && lk != 13063               // 'version' EOF
       && lk != 13066               // 'where' EOF
       && lk != 13067               // 'while' EOF
       && lk != 13070               // 'with' EOF
       && lk != 13074               // 'xquery' EOF
       && lk != 16134               // 'variable' '$'
       && lk != 20997               // Wildcard ','
       && lk != 20998               // EQName^Token ','
       && lk != 21000               // IntegerLiteral ','
       && lk != 21001               // DecimalLiteral ','
       && lk != 21002               // DoubleLiteral ','
       && lk != 21003               // StringLiteral ','
       && lk != 21036               // '.' ','
       && lk != 21037               // '..' ','
       && lk != 21038               // '/' ','
       && lk != 21062               // 'after' ','
       && lk != 21064               // 'allowing' ','
       && lk != 21065               // 'ancestor' ','
       && lk != 21066               // 'ancestor-or-self' ','
       && lk != 21067               // 'and' ','
       && lk != 21071               // 'as' ','
       && lk != 21072               // 'ascending' ','
       && lk != 21073               // 'at' ','
       && lk != 21074               // 'attribute' ','
       && lk != 21075               // 'base-uri' ','
       && lk != 21076               // 'before' ','
       && lk != 21077               // 'boundary-space' ','
       && lk != 21078               // 'break' ','
       && lk != 21080               // 'case' ','
       && lk != 21081               // 'cast' ','
       && lk != 21082               // 'castable' ','
       && lk != 21083               // 'catch' ','
       && lk != 21085               // 'child' ','
       && lk != 21086               // 'collation' ','
       && lk != 21088               // 'comment' ','
       && lk != 21089               // 'constraint' ','
       && lk != 21090               // 'construction' ','
       && lk != 21093               // 'context' ','
       && lk != 21094               // 'continue' ','
       && lk != 21095               // 'copy' ','
       && lk != 21096               // 'copy-namespaces' ','
       && lk != 21097               // 'count' ','
       && lk != 21098               // 'decimal-format' ','
       && lk != 21100               // 'declare' ','
       && lk != 21101               // 'default' ','
       && lk != 21102               // 'delete' ','
       && lk != 21103               // 'descendant' ','
       && lk != 21104               // 'descendant-or-self' ','
       && lk != 21105               // 'descending' ','
       && lk != 21110               // 'div' ','
       && lk != 21111               // 'document' ','
       && lk != 21112               // 'document-node' ','
       && lk != 21113               // 'element' ','
       && lk != 21114               // 'else' ','
       && lk != 21115               // 'empty' ','
       && lk != 21116               // 'empty-sequence' ','
       && lk != 21117               // 'encoding' ','
       && lk != 21118               // 'end' ','
       && lk != 21120               // 'eq' ','
       && lk != 21121               // 'every' ','
       && lk != 21123               // 'except' ','
       && lk != 21124               // 'exit' ','
       && lk != 21125               // 'external' ','
       && lk != 21126               // 'first' ','
       && lk != 21127               // 'following' ','
       && lk != 21128               // 'following-sibling' ','
       && lk != 21129               // 'for' ','
       && lk != 21133               // 'ft-option' ','
       && lk != 21137               // 'function' ','
       && lk != 21138               // 'ge' ','
       && lk != 21140               // 'group' ','
       && lk != 21142               // 'gt' ','
       && lk != 21143               // 'idiv' ','
       && lk != 21144               // 'if' ','
       && lk != 21145               // 'import' ','
       && lk != 21146               // 'in' ','
       && lk != 21147               // 'index' ','
       && lk != 21151               // 'insert' ','
       && lk != 21152               // 'instance' ','
       && lk != 21153               // 'integrity' ','
       && lk != 21154               // 'intersect' ','
       && lk != 21155               // 'into' ','
       && lk != 21156               // 'is' ','
       && lk != 21157               // 'item' ','
       && lk != 21162               // 'last' ','
       && lk != 21163               // 'lax' ','
       && lk != 21164               // 'le' ','
       && lk != 21166               // 'let' ','
       && lk != 21168               // 'loop' ','
       && lk != 21170               // 'lt' ','
       && lk != 21172               // 'mod' ','
       && lk != 21173               // 'modify' ','
       && lk != 21174               // 'module' ','
       && lk != 21176               // 'namespace' ','
       && lk != 21177               // 'namespace-node' ','
       && lk != 21178               // 'ne' ','
       && lk != 21183               // 'node' ','
       && lk != 21184               // 'nodes' ','
       && lk != 21190               // 'only' ','
       && lk != 21191               // 'option' ','
       && lk != 21192               // 'or' ','
       && lk != 21193               // 'order' ','
       && lk != 21194               // 'ordered' ','
       && lk != 21195               // 'ordering' ','
       && lk != 21198               // 'parent' ','
       && lk != 21204               // 'preceding' ','
       && lk != 21205               // 'preceding-sibling' ','
       && lk != 21208               // 'processing-instruction' ','
       && lk != 21210               // 'rename' ','
       && lk != 21211               // 'replace' ','
       && lk != 21212               // 'return' ','
       && lk != 21213               // 'returning' ','
       && lk != 21214               // 'revalidation' ','
       && lk != 21216               // 'satisfies' ','
       && lk != 21217               // 'schema' ','
       && lk != 21218               // 'schema-attribute' ','
       && lk != 21219               // 'schema-element' ','
       && lk != 21220               // 'score' ','
       && lk != 21221               // 'self' ','
       && lk != 21226               // 'sliding' ','
       && lk != 21227               // 'some' ','
       && lk != 21228               // 'stable' ','
       && lk != 21229               // 'start' ','
       && lk != 21232               // 'strict' ','
       && lk != 21235               // 'switch' ','
       && lk != 21236               // 'text' ','
       && lk != 21240               // 'to' ','
       && lk != 21241               // 'treat' ','
       && lk != 21242               // 'try' ','
       && lk != 21243               // 'tumbling' ','
       && lk != 21244               // 'type' ','
       && lk != 21245               // 'typeswitch' ','
       && lk != 21246               // 'union' ','
       && lk != 21248               // 'unordered' ','
       && lk != 21249               // 'updating' ','
       && lk != 21252               // 'validate' ','
       && lk != 21253               // 'value' ','
       && lk != 21254               // 'variable' ','
       && lk != 21255               // 'version' ','
       && lk != 21258               // 'where' ','
       && lk != 21259               // 'while' ','
       && lk != 21262               // 'with' ','
       && lk != 21266               // 'xquery' ','
       && lk != 27141               // Wildcard ';'
       && lk != 27142               // EQName^Token ';'
       && lk != 27144               // IntegerLiteral ';'
       && lk != 27145               // DecimalLiteral ';'
       && lk != 27146               // DoubleLiteral ';'
       && lk != 27147               // StringLiteral ';'
       && lk != 27180               // '.' ';'
       && lk != 27181               // '..' ';'
       && lk != 27182               // '/' ';'
       && lk != 27206               // 'after' ';'
       && lk != 27208               // 'allowing' ';'
       && lk != 27209               // 'ancestor' ';'
       && lk != 27210               // 'ancestor-or-self' ';'
       && lk != 27211               // 'and' ';'
       && lk != 27215               // 'as' ';'
       && lk != 27216               // 'ascending' ';'
       && lk != 27217               // 'at' ';'
       && lk != 27218               // 'attribute' ';'
       && lk != 27219               // 'base-uri' ';'
       && lk != 27220               // 'before' ';'
       && lk != 27221               // 'boundary-space' ';'
       && lk != 27222               // 'break' ';'
       && lk != 27224               // 'case' ';'
       && lk != 27225               // 'cast' ';'
       && lk != 27226               // 'castable' ';'
       && lk != 27227               // 'catch' ';'
       && lk != 27229               // 'child' ';'
       && lk != 27230               // 'collation' ';'
       && lk != 27232               // 'comment' ';'
       && lk != 27233               // 'constraint' ';'
       && lk != 27234               // 'construction' ';'
       && lk != 27237               // 'context' ';'
       && lk != 27238               // 'continue' ';'
       && lk != 27239               // 'copy' ';'
       && lk != 27240               // 'copy-namespaces' ';'
       && lk != 27241               // 'count' ';'
       && lk != 27242               // 'decimal-format' ';'
       && lk != 27244               // 'declare' ';'
       && lk != 27245               // 'default' ';'
       && lk != 27246               // 'delete' ';'
       && lk != 27247               // 'descendant' ';'
       && lk != 27248               // 'descendant-or-self' ';'
       && lk != 27249               // 'descending' ';'
       && lk != 27254               // 'div' ';'
       && lk != 27255               // 'document' ';'
       && lk != 27256               // 'document-node' ';'
       && lk != 27257               // 'element' ';'
       && lk != 27258               // 'else' ';'
       && lk != 27259               // 'empty' ';'
       && lk != 27260               // 'empty-sequence' ';'
       && lk != 27261               // 'encoding' ';'
       && lk != 27262               // 'end' ';'
       && lk != 27264               // 'eq' ';'
       && lk != 27265               // 'every' ';'
       && lk != 27267               // 'except' ';'
       && lk != 27268               // 'exit' ';'
       && lk != 27269               // 'external' ';'
       && lk != 27270               // 'first' ';'
       && lk != 27271               // 'following' ';'
       && lk != 27272               // 'following-sibling' ';'
       && lk != 27273               // 'for' ';'
       && lk != 27277               // 'ft-option' ';'
       && lk != 27281               // 'function' ';'
       && lk != 27282               // 'ge' ';'
       && lk != 27284               // 'group' ';'
       && lk != 27286               // 'gt' ';'
       && lk != 27287               // 'idiv' ';'
       && lk != 27288               // 'if' ';'
       && lk != 27289               // 'import' ';'
       && lk != 27290               // 'in' ';'
       && lk != 27291               // 'index' ';'
       && lk != 27295               // 'insert' ';'
       && lk != 27296               // 'instance' ';'
       && lk != 27297               // 'integrity' ';'
       && lk != 27298               // 'intersect' ';'
       && lk != 27299               // 'into' ';'
       && lk != 27300               // 'is' ';'
       && lk != 27301               // 'item' ';'
       && lk != 27306               // 'last' ';'
       && lk != 27307               // 'lax' ';'
       && lk != 27308               // 'le' ';'
       && lk != 27310               // 'let' ';'
       && lk != 27312               // 'loop' ';'
       && lk != 27314               // 'lt' ';'
       && lk != 27316               // 'mod' ';'
       && lk != 27317               // 'modify' ';'
       && lk != 27318               // 'module' ';'
       && lk != 27320               // 'namespace' ';'
       && lk != 27321               // 'namespace-node' ';'
       && lk != 27322               // 'ne' ';'
       && lk != 27327               // 'node' ';'
       && lk != 27328               // 'nodes' ';'
       && lk != 27334               // 'only' ';'
       && lk != 27335               // 'option' ';'
       && lk != 27336               // 'or' ';'
       && lk != 27337               // 'order' ';'
       && lk != 27338               // 'ordered' ';'
       && lk != 27339               // 'ordering' ';'
       && lk != 27342               // 'parent' ';'
       && lk != 27348               // 'preceding' ';'
       && lk != 27349               // 'preceding-sibling' ';'
       && lk != 27352               // 'processing-instruction' ';'
       && lk != 27354               // 'rename' ';'
       && lk != 27355               // 'replace' ';'
       && lk != 27356               // 'return' ';'
       && lk != 27357               // 'returning' ';'
       && lk != 27358               // 'revalidation' ';'
       && lk != 27360               // 'satisfies' ';'
       && lk != 27361               // 'schema' ';'
       && lk != 27362               // 'schema-attribute' ';'
       && lk != 27363               // 'schema-element' ';'
       && lk != 27364               // 'score' ';'
       && lk != 27365               // 'self' ';'
       && lk != 27370               // 'sliding' ';'
       && lk != 27371               // 'some' ';'
       && lk != 27372               // 'stable' ';'
       && lk != 27373               // 'start' ';'
       && lk != 27376               // 'strict' ';'
       && lk != 27379               // 'switch' ';'
       && lk != 27380               // 'text' ';'
       && lk != 27384               // 'to' ';'
       && lk != 27385               // 'treat' ';'
       && lk != 27386               // 'try' ';'
       && lk != 27387               // 'tumbling' ';'
       && lk != 27388               // 'type' ';'
       && lk != 27389               // 'typeswitch' ';'
       && lk != 27390               // 'union' ';'
       && lk != 27392               // 'unordered' ';'
       && lk != 27393               // 'updating' ';'
       && lk != 27396               // 'validate' ';'
       && lk != 27397               // 'value' ';'
       && lk != 27398               // 'variable' ';'
       && lk != 27399               // 'version' ';'
       && lk != 27402               // 'where' ';'
       && lk != 27403               // 'while' ';'
       && lk != 27406               // 'with' ';'
       && lk != 27410               // 'xquery' ';'
       && lk != 90198               // 'break' 'loop'
       && lk != 90214               // 'continue' 'loop'
       && lk != 113284              // 'exit' 'returning'
       && lk != 144389              // Wildcard '}'
       && lk != 144390              // EQName^Token '}'
       && lk != 144392              // IntegerLiteral '}'
       && lk != 144393              // DecimalLiteral '}'
       && lk != 144394              // DoubleLiteral '}'
       && lk != 144395              // StringLiteral '}'
       && lk != 144428              // '.' '}'
       && lk != 144429              // '..' '}'
       && lk != 144430              // '/' '}'
       && lk != 144454              // 'after' '}'
       && lk != 144456              // 'allowing' '}'
       && lk != 144457              // 'ancestor' '}'
       && lk != 144458              // 'ancestor-or-self' '}'
       && lk != 144459              // 'and' '}'
       && lk != 144463              // 'as' '}'
       && lk != 144464              // 'ascending' '}'
       && lk != 144465              // 'at' '}'
       && lk != 144466              // 'attribute' '}'
       && lk != 144467              // 'base-uri' '}'
       && lk != 144468              // 'before' '}'
       && lk != 144469              // 'boundary-space' '}'
       && lk != 144470              // 'break' '}'
       && lk != 144472              // 'case' '}'
       && lk != 144473              // 'cast' '}'
       && lk != 144474              // 'castable' '}'
       && lk != 144475              // 'catch' '}'
       && lk != 144477              // 'child' '}'
       && lk != 144478              // 'collation' '}'
       && lk != 144480              // 'comment' '}'
       && lk != 144481              // 'constraint' '}'
       && lk != 144482              // 'construction' '}'
       && lk != 144485              // 'context' '}'
       && lk != 144486              // 'continue' '}'
       && lk != 144487              // 'copy' '}'
       && lk != 144488              // 'copy-namespaces' '}'
       && lk != 144489              // 'count' '}'
       && lk != 144490              // 'decimal-format' '}'
       && lk != 144492              // 'declare' '}'
       && lk != 144493              // 'default' '}'
       && lk != 144494              // 'delete' '}'
       && lk != 144495              // 'descendant' '}'
       && lk != 144496              // 'descendant-or-self' '}'
       && lk != 144497              // 'descending' '}'
       && lk != 144502              // 'div' '}'
       && lk != 144503              // 'document' '}'
       && lk != 144504              // 'document-node' '}'
       && lk != 144505              // 'element' '}'
       && lk != 144506              // 'else' '}'
       && lk != 144507              // 'empty' '}'
       && lk != 144508              // 'empty-sequence' '}'
       && lk != 144509              // 'encoding' '}'
       && lk != 144510              // 'end' '}'
       && lk != 144512              // 'eq' '}'
       && lk != 144513              // 'every' '}'
       && lk != 144515              // 'except' '}'
       && lk != 144516              // 'exit' '}'
       && lk != 144517              // 'external' '}'
       && lk != 144518              // 'first' '}'
       && lk != 144519              // 'following' '}'
       && lk != 144520              // 'following-sibling' '}'
       && lk != 144521              // 'for' '}'
       && lk != 144525              // 'ft-option' '}'
       && lk != 144529              // 'function' '}'
       && lk != 144530              // 'ge' '}'
       && lk != 144532              // 'group' '}'
       && lk != 144534              // 'gt' '}'
       && lk != 144535              // 'idiv' '}'
       && lk != 144536              // 'if' '}'
       && lk != 144537              // 'import' '}'
       && lk != 144538              // 'in' '}'
       && lk != 144539              // 'index' '}'
       && lk != 144543              // 'insert' '}'
       && lk != 144544              // 'instance' '}'
       && lk != 144545              // 'integrity' '}'
       && lk != 144546              // 'intersect' '}'
       && lk != 144547              // 'into' '}'
       && lk != 144548              // 'is' '}'
       && lk != 144549              // 'item' '}'
       && lk != 144554              // 'last' '}'
       && lk != 144555              // 'lax' '}'
       && lk != 144556              // 'le' '}'
       && lk != 144558              // 'let' '}'
       && lk != 144560              // 'loop' '}'
       && lk != 144562              // 'lt' '}'
       && lk != 144564              // 'mod' '}'
       && lk != 144565              // 'modify' '}'
       && lk != 144566              // 'module' '}'
       && lk != 144568              // 'namespace' '}'
       && lk != 144569              // 'namespace-node' '}'
       && lk != 144570              // 'ne' '}'
       && lk != 144575              // 'node' '}'
       && lk != 144576              // 'nodes' '}'
       && lk != 144582              // 'only' '}'
       && lk != 144583              // 'option' '}'
       && lk != 144584              // 'or' '}'
       && lk != 144585              // 'order' '}'
       && lk != 144586              // 'ordered' '}'
       && lk != 144587              // 'ordering' '}'
       && lk != 144590              // 'parent' '}'
       && lk != 144596              // 'preceding' '}'
       && lk != 144597              // 'preceding-sibling' '}'
       && lk != 144600              // 'processing-instruction' '}'
       && lk != 144602              // 'rename' '}'
       && lk != 144603              // 'replace' '}'
       && lk != 144604              // 'return' '}'
       && lk != 144605              // 'returning' '}'
       && lk != 144606              // 'revalidation' '}'
       && lk != 144608              // 'satisfies' '}'
       && lk != 144609              // 'schema' '}'
       && lk != 144610              // 'schema-attribute' '}'
       && lk != 144611              // 'schema-element' '}'
       && lk != 144612              // 'score' '}'
       && lk != 144613              // 'self' '}'
       && lk != 144618              // 'sliding' '}'
       && lk != 144619              // 'some' '}'
       && lk != 144620              // 'stable' '}'
       && lk != 144621              // 'start' '}'
       && lk != 144624              // 'strict' '}'
       && lk != 144627              // 'switch' '}'
       && lk != 144628              // 'text' '}'
       && lk != 144632              // 'to' '}'
       && lk != 144633              // 'treat' '}'
       && lk != 144634              // 'try' '}'
       && lk != 144635              // 'tumbling' '}'
       && lk != 144636              // 'type' '}'
       && lk != 144637              // 'typeswitch' '}'
       && lk != 144638              // 'union' '}'
       && lk != 144640              // 'unordered' '}'
       && lk != 144641              // 'updating' '}'
       && lk != 144644              // 'validate' '}'
       && lk != 144645              // 'value' '}'
       && lk != 144646              // 'variable' '}'
       && lk != 144647              // 'version' '}'
       && lk != 144650              // 'where' '}'
       && lk != 144651              // 'while' '}'
       && lk != 144654              // 'with' '}'
       && lk != 144658)             // 'xquery' '}'
      {
        lk = memoized(5, e0);
        if (lk == 0)
        {
          var b0A = b0; var e0A = e0; var l1A = l1;
          var b1A = b1; var e1A = e1; var l2A = l2;
          var b2A = b2; var e2A = e2;
          try
          {
            try_Statement();
            lk = -1;
          }
          catch (p1A)
          {
            lk = -2;
          }
          b0 = b0A; e0 = e0A; l1 = l1A; if (l1 == 0) {end = e0A;} else {
          b1 = b1A; e1 = e1A; l2 = l2A; if (l2 == 0) {end = e1A;} else {
          b2 = b2A; e2 = e2A; end = e2A; }}
          memoize(5, e0, lk);
        }
      }
      if (lk != -1
       && lk != 16134               // 'variable' '$'
       && lk != 27141               // Wildcard ';'
       && lk != 27142               // EQName^Token ';'
       && lk != 27144               // IntegerLiteral ';'
       && lk != 27145               // DecimalLiteral ';'
       && lk != 27146               // DoubleLiteral ';'
       && lk != 27147               // StringLiteral ';'
       && lk != 27180               // '.' ';'
       && lk != 27181               // '..' ';'
       && lk != 27182               // '/' ';'
       && lk != 27206               // 'after' ';'
       && lk != 27208               // 'allowing' ';'
       && lk != 27209               // 'ancestor' ';'
       && lk != 27210               // 'ancestor-or-self' ';'
       && lk != 27211               // 'and' ';'
       && lk != 27215               // 'as' ';'
       && lk != 27216               // 'ascending' ';'
       && lk != 27217               // 'at' ';'
       && lk != 27218               // 'attribute' ';'
       && lk != 27219               // 'base-uri' ';'
       && lk != 27220               // 'before' ';'
       && lk != 27221               // 'boundary-space' ';'
       && lk != 27222               // 'break' ';'
       && lk != 27224               // 'case' ';'
       && lk != 27225               // 'cast' ';'
       && lk != 27226               // 'castable' ';'
       && lk != 27227               // 'catch' ';'
       && lk != 27229               // 'child' ';'
       && lk != 27230               // 'collation' ';'
       && lk != 27232               // 'comment' ';'
       && lk != 27233               // 'constraint' ';'
       && lk != 27234               // 'construction' ';'
       && lk != 27237               // 'context' ';'
       && lk != 27238               // 'continue' ';'
       && lk != 27239               // 'copy' ';'
       && lk != 27240               // 'copy-namespaces' ';'
       && lk != 27241               // 'count' ';'
       && lk != 27242               // 'decimal-format' ';'
       && lk != 27244               // 'declare' ';'
       && lk != 27245               // 'default' ';'
       && lk != 27246               // 'delete' ';'
       && lk != 27247               // 'descendant' ';'
       && lk != 27248               // 'descendant-or-self' ';'
       && lk != 27249               // 'descending' ';'
       && lk != 27254               // 'div' ';'
       && lk != 27255               // 'document' ';'
       && lk != 27256               // 'document-node' ';'
       && lk != 27257               // 'element' ';'
       && lk != 27258               // 'else' ';'
       && lk != 27259               // 'empty' ';'
       && lk != 27260               // 'empty-sequence' ';'
       && lk != 27261               // 'encoding' ';'
       && lk != 27262               // 'end' ';'
       && lk != 27264               // 'eq' ';'
       && lk != 27265               // 'every' ';'
       && lk != 27267               // 'except' ';'
       && lk != 27268               // 'exit' ';'
       && lk != 27269               // 'external' ';'
       && lk != 27270               // 'first' ';'
       && lk != 27271               // 'following' ';'
       && lk != 27272               // 'following-sibling' ';'
       && lk != 27273               // 'for' ';'
       && lk != 27277               // 'ft-option' ';'
       && lk != 27281               // 'function' ';'
       && lk != 27282               // 'ge' ';'
       && lk != 27284               // 'group' ';'
       && lk != 27286               // 'gt' ';'
       && lk != 27287               // 'idiv' ';'
       && lk != 27288               // 'if' ';'
       && lk != 27289               // 'import' ';'
       && lk != 27290               // 'in' ';'
       && lk != 27291               // 'index' ';'
       && lk != 27295               // 'insert' ';'
       && lk != 27296               // 'instance' ';'
       && lk != 27297               // 'integrity' ';'
       && lk != 27298               // 'intersect' ';'
       && lk != 27299               // 'into' ';'
       && lk != 27300               // 'is' ';'
       && lk != 27301               // 'item' ';'
       && lk != 27306               // 'last' ';'
       && lk != 27307               // 'lax' ';'
       && lk != 27308               // 'le' ';'
       && lk != 27310               // 'let' ';'
       && lk != 27312               // 'loop' ';'
       && lk != 27314               // 'lt' ';'
       && lk != 27316               // 'mod' ';'
       && lk != 27317               // 'modify' ';'
       && lk != 27318               // 'module' ';'
       && lk != 27320               // 'namespace' ';'
       && lk != 27321               // 'namespace-node' ';'
       && lk != 27322               // 'ne' ';'
       && lk != 27327               // 'node' ';'
       && lk != 27328               // 'nodes' ';'
       && lk != 27334               // 'only' ';'
       && lk != 27335               // 'option' ';'
       && lk != 27336               // 'or' ';'
       && lk != 27337               // 'order' ';'
       && lk != 27338               // 'ordered' ';'
       && lk != 27339               // 'ordering' ';'
       && lk != 27342               // 'parent' ';'
       && lk != 27348               // 'preceding' ';'
       && lk != 27349               // 'preceding-sibling' ';'
       && lk != 27352               // 'processing-instruction' ';'
       && lk != 27354               // 'rename' ';'
       && lk != 27355               // 'replace' ';'
       && lk != 27356               // 'return' ';'
       && lk != 27357               // 'returning' ';'
       && lk != 27358               // 'revalidation' ';'
       && lk != 27360               // 'satisfies' ';'
       && lk != 27361               // 'schema' ';'
       && lk != 27362               // 'schema-attribute' ';'
       && lk != 27363               // 'schema-element' ';'
       && lk != 27364               // 'score' ';'
       && lk != 27365               // 'self' ';'
       && lk != 27370               // 'sliding' ';'
       && lk != 27371               // 'some' ';'
       && lk != 27372               // 'stable' ';'
       && lk != 27373               // 'start' ';'
       && lk != 27376               // 'strict' ';'
       && lk != 27379               // 'switch' ';'
       && lk != 27380               // 'text' ';'
       && lk != 27384               // 'to' ';'
       && lk != 27385               // 'treat' ';'
       && lk != 27386               // 'try' ';'
       && lk != 27387               // 'tumbling' ';'
       && lk != 27388               // 'type' ';'
       && lk != 27389               // 'typeswitch' ';'
       && lk != 27390               // 'union' ';'
       && lk != 27392               // 'unordered' ';'
       && lk != 27393               // 'updating' ';'
       && lk != 27396               // 'validate' ';'
       && lk != 27397               // 'value' ';'
       && lk != 27398               // 'variable' ';'
       && lk != 27399               // 'version' ';'
       && lk != 27402               // 'where' ';'
       && lk != 27403               // 'while' ';'
       && lk != 27406               // 'with' ';'
       && lk != 27410               // 'xquery' ';'
       && lk != 90198               // 'break' 'loop'
       && lk != 90214               // 'continue' 'loop'
       && lk != 113284)             // 'exit' 'returning'
      {
        break;
      }
      try_Statement();
    }
  }

  function parse_StatementsAndExpr()
  {
    eventHandler.startNonterminal("StatementsAndExpr", e0);
    parse_Statements();
    whitespace();
    parse_Expr();
    eventHandler.endNonterminal("StatementsAndExpr", e0);
  }

  function try_StatementsAndExpr()
  {
    try_Statements();
    try_Expr();
  }

  function parse_StatementsAndOptionalExpr()
  {
    eventHandler.startNonterminal("StatementsAndOptionalExpr", e0);
    parse_Statements();
    if (l1 != 25                    // EOF
     && l1 != 282)                  // '}'
    {
      whitespace();
      parse_Expr();
    }
    eventHandler.endNonterminal("StatementsAndOptionalExpr", e0);
  }

  function try_StatementsAndOptionalExpr()
  {
    try_Statements();
    if (l1 != 25                    // EOF
     && l1 != 282)                  // '}'
    {
      try_Expr();
    }
  }

  function parse_Statement()
  {
    eventHandler.startNonterminal("Statement", e0);
    switch (l1)
    {
    case 132:                       // 'exit'
      lookahead2W(189);             // S^WS | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' | '<' |
      break;
    case 137:                       // 'for'
      lookahead2W(196);             // S^WS | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' |
      break;
    case 174:                       // 'let'
      lookahead2W(193);             // S^WS | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' |
      break;
    case 250:                       // 'try'
      lookahead2W(190);             // S^WS | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' | '<' |
      break;
    case 262:                       // 'variable'
      lookahead2W(187);             // S^WS | '!' | '!=' | '#' | '$' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' |
      break;
    case 276:                       // '{'
      lookahead2W(272);             // Wildcard | EQName^Token | IntegerLiteral | DecimalLiteral | DoubleLiteral |
      break;
    case 31:                        // '$'
    case 32:                        // '%'
      lookahead2W(249);             // EQName^Token | S^WS | '(:' | 'after' | 'allowing' | 'ancestor' |
      break;
    case 86:                        // 'break'
    case 102:                       // 'continue'
      lookahead2W(188);             // S^WS | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' | '<' |
      break;
    case 152:                       // 'if'
    case 243:                       // 'switch'
    case 253:                       // 'typeswitch'
    case 267:                       // 'while'
      lookahead2W(185);             // S^WS | '!' | '!=' | '#' | '(' | '(:' | '*' | '+' | '-' | '/' | '//' | ';' | '<' |
      break;
    default:
      lk = l1;
    }
    if (lk == 2836                  // '{' Wildcard
     || lk == 3103                  // '$' EQName^Token
     || lk == 3104                  // '%' EQName^Token
     || lk == 3348                  // '{' EQName^Token
     || lk == 4372                  // '{' IntegerLiteral
     || lk == 4884                  // '{' DecimalLiteral
     || lk == 5396                  // '{' DoubleLiteral
     || lk == 5908                  // '{' StringLiteral
     || lk == 16148                 // '{' '$'
     || lk == 16660                 // '{' '%'
     || lk == 17675                 // 'while' '('
     || lk == 17684                 // '{' '('
     || lk == 18196                 // '{' '(#'
     || lk == 20756                 // '{' '+'
     || lk == 21780                 // '{' '-'
     || lk == 22804                 // '{' '.'
     || lk == 23316                 // '{' '..'
     || lk == 23828                 // '{' '/'
     || lk == 24340                 // '{' '//'
     || lk == 27924                 // '{' '<'
     || lk == 28436                 // '{' '<!--'
     || lk == 30484                 // '{' '<?'
     || lk == 34068                 // '{' '@'
     || lk == 35092                 // '{' '['
     || lk == 35871                 // '$' 'after'
     || lk == 35872                 // '%' 'after'
     || lk == 36116                 // '{' 'after'
     || lk == 36895                 // '$' 'allowing'
     || lk == 36896                 // '%' 'allowing'
     || lk == 37140                 // '{' 'allowing'
     || lk == 37407                 // '$' 'ancestor'
     || lk == 37408                 // '%' 'ancestor'
     || lk == 37652                 // '{' 'ancestor'
     || lk == 37919                 // '$' 'ancestor-or-self'
     || lk == 37920                 // '%' 'ancestor-or-self'
     || lk == 38164                 // '{' 'ancestor-or-self'
     || lk == 38431                 // '$' 'and'
     || lk == 38432                 // '%' 'and'
     || lk == 38676                 // '{' 'and'
     || lk == 39700                 // '{' 'append'
     || lk == 40479                 // '$' 'as'
     || lk == 40480                 // '%' 'as'
     || lk == 40724                 // '{' 'as'
     || lk == 40991                 // '$' 'ascending'
     || lk == 40992                 // '%' 'ascending'
     || lk == 41236                 // '{' 'ascending'
     || lk == 41503                 // '$' 'at'
     || lk == 41504                 // '%' 'at'
     || lk == 41748                 // '{' 'at'
     || lk == 42015                 // '$' 'attribute'
     || lk == 42016                 // '%' 'attribute'
     || lk == 42260                 // '{' 'attribute'
     || lk == 42527                 // '$' 'base-uri'
     || lk == 42528                 // '%' 'base-uri'
     || lk == 42772                 // '{' 'base-uri'
     || lk == 43039                 // '$' 'before'
     || lk == 43040                 // '%' 'before'
     || lk == 43284                 // '{' 'before'
     || lk == 43551                 // '$' 'boundary-space'
     || lk == 43552                 // '%' 'boundary-space'
     || lk == 43796                 // '{' 'boundary-space'
     || lk == 44063                 // '$' 'break'
     || lk == 44064                 // '%' 'break'
     || lk == 44308                 // '{' 'break'
     || lk == 45087                 // '$' 'case'
     || lk == 45088                 // '%' 'case'
     || lk == 45332                 // '{' 'case'
     || lk == 45599                 // '$' 'cast'
     || lk == 45600                 // '%' 'cast'
     || lk == 45844                 // '{' 'cast'
     || lk == 46111                 // '$' 'castable'
     || lk == 46112                 // '%' 'castable'
     || lk == 46356                 // '{' 'castable'
     || lk == 46623                 // '$' 'catch'
     || lk == 46624                 // '%' 'catch'
     || lk == 46868                 // '{' 'catch'
     || lk == 47647                 // '$' 'child'
     || lk == 47648                 // '%' 'child'
     || lk == 47892                 // '{' 'child'
     || lk == 48159                 // '$' 'collation'
     || lk == 48160                 // '%' 'collation'
     || lk == 48404                 // '{' 'collation'
     || lk == 49183                 // '$' 'comment'
     || lk == 49184                 // '%' 'comment'
     || lk == 49428                 // '{' 'comment'
     || lk == 49695                 // '$' 'constraint'
     || lk == 49696                 // '%' 'constraint'
     || lk == 49940                 // '{' 'constraint'
     || lk == 50207                 // '$' 'construction'
     || lk == 50208                 // '%' 'construction'
     || lk == 50452                 // '{' 'construction'
     || lk == 51743                 // '$' 'context'
     || lk == 51744                 // '%' 'context'
     || lk == 51988                 // '{' 'context'
     || lk == 52255                 // '$' 'continue'
     || lk == 52256                 // '%' 'continue'
     || lk == 52500                 // '{' 'continue'
     || lk == 52767                 // '$' 'copy'
     || lk == 52768                 // '%' 'copy'
     || lk == 53012                 // '{' 'copy'
     || lk == 53279                 // '$' 'copy-namespaces'
     || lk == 53280                 // '%' 'copy-namespaces'
     || lk == 53524                 // '{' 'copy-namespaces'
     || lk == 53791                 // '$' 'count'
     || lk == 53792                 // '%' 'count'
     || lk == 54036                 // '{' 'count'
     || lk == 54303                 // '$' 'decimal-format'
     || lk == 54304                 // '%' 'decimal-format'
     || lk == 54548                 // '{' 'decimal-format'
     || lk == 55327                 // '$' 'declare'
     || lk == 55328                 // '%' 'declare'
     || lk == 55572                 // '{' 'declare'
     || lk == 55839                 // '$' 'default'
     || lk == 55840                 // '%' 'default'
     || lk == 56084                 // '{' 'default'
     || lk == 56351                 // '$' 'delete'
     || lk == 56352                 // '%' 'delete'
     || lk == 56596                 // '{' 'delete'
     || lk == 56863                 // '$' 'descendant'
     || lk == 56864                 // '%' 'descendant'
     || lk == 57108                 // '{' 'descendant'
     || lk == 57375                 // '$' 'descendant-or-self'
     || lk == 57376                 // '%' 'descendant-or-self'
     || lk == 57620                 // '{' 'descendant-or-self'
     || lk == 57887                 // '$' 'descending'
     || lk == 57888                 // '%' 'descending'
     || lk == 58132                 // '{' 'descending'
     || lk == 60447                 // '$' 'div'
     || lk == 60448                 // '%' 'div'
     || lk == 60692                 // '{' 'div'
     || lk == 60959                 // '$' 'document'
     || lk == 60960                 // '%' 'document'
     || lk == 61204                 // '{' 'document'
     || lk == 61471                 // '$' 'document-node'
     || lk == 61472                 // '%' 'document-node'
     || lk == 61716                 // '{' 'document-node'
     || lk == 61983                 // '$' 'element'
     || lk == 61984                 // '%' 'element'
     || lk == 62228                 // '{' 'element'
     || lk == 62495                 // '$' 'else'
     || lk == 62496                 // '%' 'else'
     || lk == 62740                 // '{' 'else'
     || lk == 63007                 // '$' 'empty'
     || lk == 63008                 // '%' 'empty'
     || lk == 63252                 // '{' 'empty'
     || lk == 63519                 // '$' 'empty-sequence'
     || lk == 63520                 // '%' 'empty-sequence'
     || lk == 63764                 // '{' 'empty-sequence'
     || lk == 64031                 // '$' 'encoding'
     || lk == 64032                 // '%' 'encoding'
     || lk == 64276                 // '{' 'encoding'
     || lk == 64543                 // '$' 'end'
     || lk == 64544                 // '%' 'end'
     || lk == 64788                 // '{' 'end'
     || lk == 65567                 // '$' 'eq'
     || lk == 65568                 // '%' 'eq'
     || lk == 65812                 // '{' 'eq'
     || lk == 66079                 // '$' 'every'
     || lk == 66080                 // '%' 'every'
     || lk == 66324                 // '{' 'every'
     || lk == 67103                 // '$' 'except'
     || lk == 67104                 // '%' 'except'
     || lk == 67348                 // '{' 'except'
     || lk == 67615                 // '$' 'exit'
     || lk == 67616                 // '%' 'exit'
     || lk == 67860                 // '{' 'exit'
     || lk == 68127                 // '$' 'external'
     || lk == 68128                 // '%' 'external'
     || lk == 68372                 // '{' 'external'
     || lk == 68639                 // '$' 'first'
     || lk == 68640                 // '%' 'first'
     || lk == 68884                 // '{' 'first'
     || lk == 69151                 // '$' 'following'
     || lk == 69152                 // '%' 'following'
     || lk == 69396                 // '{' 'following'
     || lk == 69663                 // '$' 'following-sibling'
     || lk == 69664                 // '%' 'following-sibling'
     || lk == 69908                 // '{' 'following-sibling'
     || lk == 70175                 // '$' 'for'
     || lk == 70176                 // '%' 'for'
     || lk == 70420                 // '{' 'for'
     || lk == 72223                 // '$' 'ft-option'
     || lk == 72224                 // '%' 'ft-option'
     || lk == 72468                 // '{' 'ft-option'
     || lk == 74271                 // '$' 'function'
     || lk == 74272                 // '%' 'function'
     || lk == 74516                 // '{' 'function'
     || lk == 74783                 // '$' 'ge'
     || lk == 74784                 // '%' 'ge'
     || lk == 75028                 // '{' 'ge'
     || lk == 75807                 // '$' 'group'
     || lk == 75808                 // '%' 'group'
     || lk == 76052                 // '{' 'group'
     || lk == 76831                 // '$' 'gt'
     || lk == 76832                 // '%' 'gt'
     || lk == 77076                 // '{' 'gt'
     || lk == 77343                 // '$' 'idiv'
     || lk == 77344                 // '%' 'idiv'
     || lk == 77588                 // '{' 'idiv'
     || lk == 77855                 // '$' 'if'
     || lk == 77856                 // '%' 'if'
     || lk == 78100                 // '{' 'if'
     || lk == 78367                 // '$' 'import'
     || lk == 78368                 // '%' 'import'
     || lk == 78612                 // '{' 'import'
     || lk == 78879                 // '$' 'in'
     || lk == 78880                 // '%' 'in'
     || lk == 79124                 // '{' 'in'
     || lk == 79391                 // '$' 'index'
     || lk == 79392                 // '%' 'index'
     || lk == 79636                 // '{' 'index'
     || lk == 81439                 // '$' 'insert'
     || lk == 81440                 // '%' 'insert'
     || lk == 81684                 // '{' 'insert'
     || lk == 81951                 // '$' 'instance'
     || lk == 81952                 // '%' 'instance'
     || lk == 82196                 // '{' 'instance'
     || lk == 82463                 // '$' 'integrity'
     || lk == 82464                 // '%' 'integrity'
     || lk == 82708                 // '{' 'integrity'
     || lk == 82975                 // '$' 'intersect'
     || lk == 82976                 // '%' 'intersect'
     || lk == 83220                 // '{' 'intersect'
     || lk == 83487                 // '$' 'into'
     || lk == 83488                 // '%' 'into'
     || lk == 83732                 // '{' 'into'
     || lk == 83999                 // '$' 'is'
     || lk == 84000                 // '%' 'is'
     || lk == 84244                 // '{' 'is'
     || lk == 84511                 // '$' 'item'
     || lk == 84512                 // '%' 'item'
     || lk == 84756                 // '{' 'item'
     || lk == 87071                 // '$' 'last'
     || lk == 87072                 // '%' 'last'
     || lk == 87316                 // '{' 'last'
     || lk == 87583                 // '$' 'lax'
     || lk == 87584                 // '%' 'lax'
     || lk == 87828                 // '{' 'lax'
     || lk == 88095                 // '$' 'le'
     || lk == 88096                 // '%' 'le'
     || lk == 88340                 // '{' 'le'
     || lk == 89119                 // '$' 'let'
     || lk == 89120                 // '%' 'let'
     || lk == 89364                 // '{' 'let'
     || lk == 90143                 // '$' 'loop'
     || lk == 90144                 // '%' 'loop'
     || lk == 90388                 // '{' 'loop'
     || lk == 91167                 // '$' 'lt'
     || lk == 91168                 // '%' 'lt'
     || lk == 91412                 // '{' 'lt'
     || lk == 92191                 // '$' 'mod'
     || lk == 92192                 // '%' 'mod'
     || lk == 92436                 // '{' 'mod'
     || lk == 92703                 // '$' 'modify'
     || lk == 92704                 // '%' 'modify'
     || lk == 92948                 // '{' 'modify'
     || lk == 93215                 // '$' 'module'
     || lk == 93216                 // '%' 'module'
     || lk == 93460                 // '{' 'module'
     || lk == 94239                 // '$' 'namespace'
     || lk == 94240                 // '%' 'namespace'
     || lk == 94484                 // '{' 'namespace'
     || lk == 94751                 // '$' 'namespace-node'
     || lk == 94752                 // '%' 'namespace-node'
     || lk == 94996                 // '{' 'namespace-node'
     || lk == 95263                 // '$' 'ne'
     || lk == 95264                 // '%' 'ne'
     || lk == 95508                 // '{' 'ne'
     || lk == 97823                 // '$' 'node'
     || lk == 97824                 // '%' 'node'
     || lk == 98068                 // '{' 'node'
     || lk == 98335                 // '$' 'nodes'
     || lk == 98336                 // '%' 'nodes'
     || lk == 98580                 // '{' 'nodes'
     || lk == 101407                // '$' 'only'
     || lk == 101408                // '%' 'only'
     || lk == 101652                // '{' 'only'
     || lk == 101919                // '$' 'option'
     || lk == 101920                // '%' 'option'
     || lk == 102164                // '{' 'option'
     || lk == 102431                // '$' 'or'
     || lk == 102432                // '%' 'or'
     || lk == 102676                // '{' 'or'
     || lk == 102943                // '$' 'order'
     || lk == 102944                // '%' 'order'
     || lk == 103188                // '{' 'order'
     || lk == 103455                // '$' 'ordered'
     || lk == 103456                // '%' 'ordered'
     || lk == 103700                // '{' 'ordered'
     || lk == 103967                // '$' 'ordering'
     || lk == 103968                // '%' 'ordering'
     || lk == 104212                // '{' 'ordering'
     || lk == 105503                // '$' 'parent'
     || lk == 105504                // '%' 'parent'
     || lk == 105748                // '{' 'parent'
     || lk == 108575                // '$' 'preceding'
     || lk == 108576                // '%' 'preceding'
     || lk == 108820                // '{' 'preceding'
     || lk == 109087                // '$' 'preceding-sibling'
     || lk == 109088                // '%' 'preceding-sibling'
     || lk == 109332                // '{' 'preceding-sibling'
     || lk == 110623                // '$' 'processing-instruction'
     || lk == 110624                // '%' 'processing-instruction'
     || lk == 110868                // '{' 'processing-instruction'
     || lk == 111647                // '$' 'rename'
     || lk == 111648                // '%' 'rename'
     || lk == 111892                // '{' 'rename'
     || lk == 112159                // '$' 'replace'
     || lk == 112160                // '%' 'replace'
     || lk == 112404                // '{' 'replace'
     || lk == 112671                // '$' 'return'
     || lk == 112672                // '%' 'return'
     || lk == 112916                // '{' 'return'
     || lk == 113183                // '$' 'returning'
     || lk == 113184                // '%' 'returning'
     || lk == 113428                // '{' 'returning'
     || lk == 113695                // '$' 'revalidation'
     || lk == 113696                // '%' 'revalidation'
     || lk == 113940              