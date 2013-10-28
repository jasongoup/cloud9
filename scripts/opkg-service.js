#!/usr/bin/env node

const PATH = require("path");
const ARCHITECT = require("architect");
var fs = require('fs.extra');
var child = require ('child_process');

var OPKG_CONF = '/data/misc/opkg/opkg.conf';
var OPKG_CL = "opkg-cl";

function Error (message, err) {
	message.type = "result";
	message.code = -1;
	message.data = err;
	
	return message;
}

exports.main = function main(host, port, callback) {
    var plugins = [
        {
            packagePath: "connect-architect/connect",
            host: host,
            port: port
        },
        {
            packagePath: "connect-architect/connect.static",
            prefix: "/static"
        },
        {
            packagePath: "connect-architect/connect.session",
            key: "connect.architect." + port,
            secret: "1234"
        },
        {
            packagePath: "connect-architect/connect.session.memory"
        },
        {
            packagePath: "architect/plugins/architect.log"
        },
        {
            packagePath: "./../server-plugin",
            messageRoute: /^\/transport\/ser[ver]+/,
            messagePath: "/transport/server",
            debug: true
        },
        {
            provides: [],
            consumes: [
                "smith.transport.server",
                "connect"
            ],
            setup: function (options, imports, register) {

                imports.connect.useStart(imports.connect.getModule().static(PATH.join(__dirname, "www")));

                var TRANSPORT = imports["smith.transport.server"];

                // Fires once for every *new* client connection (not reconnects).
                TRANSPORT.on("connect", function (connection) {

                    console.log("Connected:", connection.id);

                    var address = connection.handshake.address;
                    console.log("New connection from " + address.address + ":" + address.port);


                    // Fires once after reconnect attempts have failed and a timeout has passed.
                    /*
                     connection.once("disconnect", function(reason) {
                     console.log("Disconnected:", connection.id, reason);
                     });
                     */
                    connection.on("message", function (message) {
                        if (!message) {
                            return;
                        }
                        //console.log("Got message:", message);
                        if (typeof message === "string") {
                            connection.send (message);  // heartbeat ?
                            return;
                        }

                        console.log("Got message:", message);
                        if (typeof message.action != "string") {
                            var response = {type: "error", data: "invalid message type"};
                            connection.send (response);
                            connection.close ();
                            return;
                        }

                        switch (message.action) {
                            case "configure":
                                if (message.data) {
                                    console.log(message.data + "\n");
                                    setOpkgConf(connection, message.data);
                                } else {
                                    connection.send (Error (message, "invalid parameter"));
                                }
                                break;

                            case "install":
                            case "remove":
                                if (typeof message.packages === "undefined") {
                                    connection.send (Error (message, "invalid parameter: no package specified"));
                                    return;
                                }

                            case "list":
                            case "update":
                                opkgCl (connection, message);
                                break;
                            default:
                        }
                    });

                    connection.on("away", function () {
                        console.log("Away:", connection.id);
                        connection.send({say: "While server away"});
                    });

                    connection.on("back", function () {
                        console.log("Back:", connection.id);
                        connection.send({say: "Server back"});
                    });
                });

                register(null, {});
            }
        }
    ];

    ARCHITECT.createApp(ARCHITECT.resolveConfig(plugins, __dirname), function (err, app) {
        if (err) {
            return callback(err);
        }
        callback(null, app);
    });
}

if (require.main === module) {

    var host = (process.argv.join(" ").match(/-h\s(\S*)/) || ["", "0.0.0.0"])[1];
    var port = parseInt(process.env.PORT || 17766, 10);

    exports.main(host, port, function (err) {
        if (err) {
            console.error(err.stack);
            process.exit(1);
        }
        // Server should now be running.
    });
}

function setOpkgConf(connection, url) {
    var str = "src/gz snapshots " + url + "\n"

    fs.outputFile (OPKG_CONF, str, function (err) {
        if (err) {
            connection.send ({type: "result", code: -1, action: "configure", data: err});
            return;
        }

        opkgCl (connection, {action: "update"});
    });
}

function opkgCl (connection, message, callback) {
    var args = [];
    if (message.forceOpts) {
        if (typeof message.forceOpts === "object") {
            for (var key in message.forceOpts) {
                args.push ("--" + message.forceOpts[key]);
            }
        } else if (typeof message.forceOpts === "string") {
            args = args.concat (message.forceOpts.split (" "));
        }
    }

    args.push (" -f");
    args.push (OPKG_CONF);
    args.push (message.action);
    
    if (typeof message.packages === "string") {
        message.packages = message.packages.split (" ");
    }

    args = args.concat (message.packages);
    
    console.log (OPKG_CL + args.join (" "));
    child.execFile(OPKG_CL, args,{env:process.env}, function (err, stdout, stderr) {
        if (callback) {
            apply (null, [err, stdout, stderr]);
        } else {
            var resp = {type : "result", action: message.action, "code": (err ? -1 : 0), data: stdout, error: stderr};
            console.log ("response:" + resp);
            connection.send (resp);
        }
    });
}
