/**
 * Created with IntelliJ IDEA.
 * User: jiff
 * Date: 13-7-25
 * Time: 上午10:57
 * Description: client communicate with Opkg service running inside PIA
 *              configure, update, install, remove, upgrade ...
 *
 */

define(function(require, exports, module) {
// basic imports
    var EventEmitter = require("ace/lib/event_emitter").EventEmitter;
    var oop = require("ace/lib/oop");

    var sio = require("smith.io");


// for us to do a require later
    var OpkgClient = module.exports = function () {
        this.connection = undefined;
    };

    oop.inherits (OpkgClient, EventEmitter);

    (function () {
        oop.implement(this, EventEmitter);

        this.once = function(event, fun) {
            var _self = this;
            var newCallback = function() {
                fun && fun.apply(_self, arguments);
                _self.removeEventListener(event, newCallback);
            };
            this.addEventListener(event, newCallback);
        };

        //this.emit = this._dispatchEvent;

        this.emit = this._emit;

        this.isConnecting = function () {
            return this.status === "connecting" ? true : false;
        };

        this.isConnected = function () {
            return this.connection ? true : false;
        };

        this.$onMessage = function (message) {
            if (message.type === "result") {
                // emit opkg-install/opkg-remove/opkg-list signal, code is the
                // return code of the opkg command, data is stdout, error is stderr
                this.emit ("opkg-" + message.action, message);
                return;
            }
        };

        this.$parseInstalled = function (data) {
            var pkgs = {};

            /* put pkgname:version in map */
            data.split ('\n').map (function (line) {
                /* pkgname - version */
                var pair = line.split (' - ');
                if (pair.length < 2) {
                    /* TODO: report error */
                    return;
                }

                /* TODO: make sure key/value is not null string */
                var key = pair[0];
                pkgs[key] = pair[1];
            });

            return pkgs;
        };

        this.connect = function (host, port, callback) {
            var self = this;

            if (this.isConnected ()) {
                this.disconnect (function () {
                    self.connect (host, port, callback);
                    return;
                });

                return false;
            }

            if (this.isConnecting ()) {
                // TODO: cancel connect
                return;
            }

            this.status = "connecting";

            var options = { port : 17766, prefix: "/transport/server"};

            options.host = host;
            if (port) {
                options.port = port;
            }

            sio.connect(options, function (err, connection) {
                if (err) {
                    self.status = "closed";

                    if (callback)
                        callback.apply (this, [-1,"", err]);
                    return;
                }

                connection.on("connect", function () {
                    self.status = "connected";

                    self.connection = connection;

                    self.emit ("connect", connection);

                    self.on ('opkg-list-installed', function (message) {
                        var pkgs = self.$parseInstalled (message.data);

                        self.emit ("list", [pkgs]);
                    });
		   /*		
		   self.on('opkg-remove',function(message) {
			
			var pkgs = self.$parseInstalled (message.data);

                        self.emit ("list", [pkgs]);
		 
                   });
		    */
		   
		    	
                    return true;
                });

                connection.on("disconnect", function (reason) {
                    // FIXME: destroy connection

                    self.status = "closed";
                    self.connection = undefined;
                    self.emit ("disconnect", [reason]);
                });

                connection.on("message", function (message) {

                    if (typeof message === "object") {
                        self.$onMessage (message);
                    } else if (typeof message === "string") {
                        /*
                         if (message.indexOf("ping:") === 0) {
                         console.log("Received", message);
                         } else if (message.indexOf ("pong:") === 0) {
                         console.log("Received", message);
                         }
                         */
                    }
                });

                connection.on("away", function () {
                    self.emit ("away");
                });

                connection.on("back", function () {
                    self.emit ("back");
                });
            });

            return true;
        };

        this.disconnect = function (callback) {
            /* FIXME: how to disconnect ? */

            delete this.connection;
            return true;
        };

        /*
         * send request to list installed packages,
         * return all packages if 'packages' argument is null
         *
         * callback - [-1, errormsg]
         *          - [0, {pkgname:version, ...} ]
         */
        this.list = function (packages, callback) {
            var self = this;

            if (!this.isConnected ()) {
                return false;
            }

            self.connection.send ({action: "list-installed", packages : packages});

            if (callback) {
                self.once ('opkg-list-installed', function (message) {
                    if (message.code == -1) {
                        callback.apply (self, [message.code, message.data, message.error]);
                        return;
                    }

                    var pkgs = self.$parseInstalled (message.data);

                    callback.apply (self, [message.code, pkgs]);
                });
            }

            return true;
        };


        this.remove = function (packages, callback) {
            var self = this;
            if (!this.isConnected ()) {
                return false;
            }

            // TODO: pass in removal options
            this.connection.send ({action: "remove", packages : packages,
                forceOpts : "--force-removal-of-dependent-packages"});
            if (callback) {
                self.once ('opkg-remove', function (message) {
                    callback.apply (self, [message.code, message.data, message.error]);
                    if (message.code == 0) {
                        self.emit ("removed", packages);
                    }
                });
            }
            return true;
        };

        this.install = function (packages, callback) {
            var self = this;
            if (!this.isConnected ()) {
                return false;
            }

            this.connection.send ({action: "install", packages : packages});
            if (callback) {
                self.once ('opkg-install', function (message) {
                    callback.apply (self, [message.code, message.data, message.error]);
                    if (message.code == 0) {
                        self.emit ("installed", packages);
                    }
                });
            }
            return true;
        };

        /*
         OpkgClient.prototype.upgrade = function (packages, callback) {

         };
         */
        this.upgrade = this.install;

        /* request Opkg service to update its Package.gz from opk repository */
        this.update = function (callback) {
            var self = this;
            this.connection.send ({action: "update"});

            self.once ('opkg-update', function (message) {
                if (callback)
                    callback.apply (self, [message.code, message.data, message.error]);
                if (message.code == 0) {
                    self.emit ("updated");
                }
            });

        };

        this.configure = function (url, callback) {
            var self = this;
            this.connection.send ({action: "configure", data : url});
            if (callback) {
                self.once ('opkg-configure', function (message) {
                    callback.apply (self, [message.code, message.data, message.error]);
                });
            }
        };
    }).call (OpkgClient.prototype);
});
//module.exports = OpkgWrapper;
