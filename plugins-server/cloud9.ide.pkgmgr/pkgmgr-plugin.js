/**
 * Created with IntelliJ IDEA.
 * User: jiff
 * Date: 13-6-27
 * Time: 下午7:19
 * To change this template use File | Settings | File Templates.
 */


"use strict";

var util = require("util");
var fsnode = require("vfs-nodefs-adapter");
var Plugin = require("../cloud9.core/plugin");
var assert = require("assert");
var xmldom = require ("xmldom");
var fs     = require ("fs.extra");
var child = require ("child_process");
var Opkg   = require ('./opkg');


var name = "pkgmgr";
var ProcessManager;
var EventBus;

var SETTINGS_PATH;
var FS;
var trimFilePrefix;
var locationsToSwap = {"files" : "active", "file" : "path", "tree_selection": "path" };
var propertiesToSwap= ["projecttree", "tabcycle", "recentfiles"];

module.exports = function setup(options, imports, register) {
    assert(options.settingsPath, "option 'settingsPath' is required");
    SETTINGS_PATH = options.settingsPath;

    ProcessManager = imports["process-manager"];
    EventBus = imports.eventbus;

    imports.sandbox.getProjectDir(function(err, projectDir) {
        FS = fsnode(imports.vfs, projectDir);

        // If absolute settings path option is set we use that path and NodeJS's FS.
        // This is needed by c9local where settings file cannot be stored at `/.settings`.
        if (typeof options.absoluteSettingsPath !== "undefined") {
            FS = require("fs.extra");
            if (typeof FS.exists !== "function") {
                FS.exists = require("path").exists;
            }
            SETTINGS_PATH = options.absoluteSettingsPath;
        }

        trimFilePrefix = options.trimFilePrefix;
        imports.ide.register(name, OpkgPlugin, register);
    });
};

var OpkgPlugin = function(ide, workspace) {
    Plugin.call(this, ide, workspace);

    this.pm = ProcessManager;
    this.eventbus = EventBus;
    this.workspaceId = workspace.workspaceId;
    this.channel = this.workspaceId + "::opkg";

    this.reposPath = workspace.workspaceDir + "/.opkg";

    this.hooks = ["command"];
    this.name = "opkg";
    this.opkgEnv = {};

    this.fs = FS;
    this.settingsPath = SETTINGS_PATH;

};

util.inherits(OpkgPlugin, Plugin);

(function() {
    this.processCount = 0;

    this.init = function() {
        var self = this;
        this.eventbus.on(this.channel, function(msg) {
            if (msg.type == "shell-start")
                self.processCount += 1;

            if (msg.type == "shell-exit")
                self.processCount -= 1;

            self.ide.broadcast(JSON.stringify(msg), self.name);
        });

        if (!fs.existsSync (this.reposPath))
            fs.mkdirSync (this.reposPath);
    };

    this.log = function(level, description) {
        var msg = {};

        msg.extra = "opkg";
        msg.type = "log";
        msg.level = level;
        msg.message = description;

        this.ide.broadcast(JSON.stringify(msg), this.name);
    };

    this.result = function (code, message, action) {
        var msg = {};

        msg.code = code;
        msg.extra = "opkg";
        msg.type = "result";
        msg.action = action;
        msg.message = message;

        this.ide.broadcast(JSON.stringify(msg), this.name);
    };

    this.command = function(user, message, client) {
        if (message.command != "opkg")
            return false;

        var self = this;

        switch (message.action) {
            case "list":
                self.list (client);
                break;
            case "index":
                self.index (client);
                break;
            case "build":
                this.loadSettings(user, function(err, settings) {
                    if (err) {
                        // FIXME: howto send/receive via through client
                        client.send (err);
                    } else {
                        self.build (message.project,message.packarray,settings, client);
                    }
                });
                break;
        }

        return true;
    };

    this.checksetting = function (proj, client) {
        var pkgs = proj.getElementsByTagName ("package");
        var m = {src: "Source directory", dest: "Destination directory", name: "Project name",
            ver: "Version",
            homepage: "Homepage", author : "Author"};

        for (var key in m) {
            console.log ("Checking project attribute " + key + ":");
            var val = proj.getAttribute (key);
            if (!val) {
                console.err ("not defined");
                return false;
            } else {
                console.log (val);
            }
        }

        var srcdir = checkdir (proj.getAttribute ("src"));
        if (!srcdir) {
            console.err ("cannot access source directory");
            return false;
        }

        var destdir = checkdir (proj.getAttribute ("dest"));
        if (!destdir) {
            console.err ("cannot access destination directory");
            return false;
        }
    };

    this.list = function (client) {
        var self = this;
        fs.readFile (this.reposPath + "/Packages", {encoding : "ascii"}, function (err, data) {
            if (err) {
                self.result (-1, err, "list");
                return;
            }
            var packages = {};

            var content = data.toString ();
            content.split ('\n\n\n').map (function (lines) {
                var name = undefined;
                var ver  = undefined;

                lines.split ('\n').map (function (line) {
                    var pair = line.split (": ", 2);
                    if (pair.length == 2) {
                        if (pair[0] === "Package") {
                            name = pair[1];
                        } else if (pair[0] === "Version") {
                            ver = pair[1];
                            packages[name] = ver;
                        }
                    }
                });
            });
		   
	    for(var  kvp in packages){
		
		console.log("kvp=" + kvp+"\n");
		console.log("packages[]"+packages[kvp]+"\n");


	    }	
	
            self.result (0, packages, "list");
        });
    };

    this.index = function (client) {
        var self = this;

    	var args = ["-p", "Packages", "."];

	console.log("enter the opkg-make-index \n");

        child.execFile('opkg-make-index', args, {cwd:self.reposPath}, function(err, stdout, stderr) {
            if (err) {
                self.result (-1, stderr, "index");
            } else {
                console.log ("index updated:" + stdout);
                self.result (0, stdout, "index");
            }
        });



	

	
    };


    this.deletePackageInfo = function(packageArray,opkg) {

         var self = this;
	 if(packageArray==undefined || packageArray.length==0)
		return ;

	console.log("enter the deletePackageInfo \n");
	
         for(var  i=0;i<packageArray.length;i++){

                opkg.rmFile(packageArray[i]);

        }

    }


    this.build = function (projname,packageArray, settings, client) {
        var tag = null;
        var self = this;
		
	settings = settings.replace(/\|\*\*\|/g,"\n");





        var doc = new xmldom.DOMParser ().parseFromString (settings);
        var projs = doc.getElementsByTagName ("project");
        for (var i = 0; i < projs.length; i++) {
            var proj = projs[i];
            console.log ("====================================")
            console.log ("Project:" + proj.getAttribute("name"));
            if (proj.getAttribute ("name") == projname) {
                var opkg = new Opkg (proj, self.reposPath);
		 

		 //console.log("bbbbbbbbbbbbbb\n");	
		 //console.log("packageArray:" +packageArray);
		
		 
		 self.deletePackageInfo(packageArray,opkg);
		 if(!opkg.pkgCount ()){
			self.index(client);
		 }

		
		

                opkg.once ("error", function (code, errmsg) {
                    console.log ("error occur in package " + ":" + errmsg);
                    self.result (code, errmsg, "build");

                    opkg.removeAllListeners("pkg-start");
                    opkg.removeAllListeners("pkg-stop");

                    opkg.removeAllListeners("error");
                    opkg.removeAllListeners("log");

                    // FIXME: release opkg instance
                    opkg = undefined;
                });

                opkg.on ("pkg-start", function (index, msg) {
                    console.log ( + index + ":" + msg);
                    self.log ("info", "creating package " + msg);
                });

                opkg.on ("log", function (level, message) {
                    self.log (level, message);
                });

                opkg.on ("pkg-end", function (index, msg) {
                    self.log ("info", "successfully created package" + msg);
                    if (++index < opkg.pkgCount ()) {
                        opkg.make (index);
                    } else {
                        self.log ("info", "all packages in project are created: " + projname);
                        // all package built, update package repository
                        opkg.removeAllListeners("pkg-start");
                        opkg.removeAllListeners("pkg-stop");

                        opkg.removeAllListeners("error");
                        opkg.removeAllListeners("log");

                        self.result (0, "build successful", "build");

                        // FIXME: release opkg instance
                        opkg = undefined;
                        //self.index ();
                    }
                });

                opkg.make ();
                return;
            }
        }
        // TODO: cannot find project, report error
    };

    this.loadSettings = function(user, callback) {
        console.log("load settings", this.settingsPath);
        var self = this;
        this.fs.exists(this.settingsPath, function(exists) {
            if (exists) {
                self.fs.readFile(self.settingsPath, "utf8", function(err, settings) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    // for local version, we need to pluck the paths in settings prepended with username + workspace id (short)
                    if (trimFilePrefix !== undefined) {
                        var attrSet = '="';

                        for (var l in locationsToSwap) {
                            var attribute = locationsToSwap[l] + attrSet;

                            settings = settings.replace(new RegExp(attribute + "/workspace", "g"), attribute + trimFilePrefix + "/workspace");
                        }

                        propertiesToSwap.forEach(function (el, idx, arr) {
                            var openTagPos= settings.indexOf("<" + el);
                            var closeTagPos= settings.indexOf("</" + el + ">");

                            if (openTagPos > 0 && closeTagPos > 0) {
                                var originalPath = settings.substring(openTagPos, closeTagPos);
                                var newPath = originalPath.replace(new RegExp("/workspace", "g"), trimFilePrefix + "/workspace");

                                settings = settings.replace(originalPath, newPath);
                            }
                        });
                    }

                    callback(err, settings);
                });
            }
            else {
                callback("settings file does not exist", "");
            }
        });
    };

    this.canShutdown = function() {
        return this.processCount === 0;
    };

}).call(OpkgPlugin.prototype);
