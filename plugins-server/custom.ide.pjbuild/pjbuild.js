/**
 * Custom Module for the Web IDE
 *
 * @author DengJianYong
 */
"use strict";

var Plugin = require("../cloud9.core/plugin");
var assert = require("assert");
var util   = require("util");
var child  = require('child_process');
var fs     = require("fs.extra");
var xmldom = require ("xmldom");
var name   = "pjbuild";

var SETTINGS_PATH;

module.exports = function setup(options, imports, register) {
    assert(options.settingsPath, "option 'settingsPath' is required");
	SETTINGS_PATH = options.settingsPath;
	imports.ide.register(name, PjbuildPlugin, register);
};

var PjbuildPlugin = function(ide, workspace) {
    Plugin.call(this, ide, workspace);
    this.hooks = ["command"];
    this.name = name;
	this.settingsPath = SETTINGS_PATH;
	this.fs = fs;
};

util.inherits(PjbuildPlugin, Plugin);

(function() {

    this.command = function(user, message, client) {

       if (message.command != "pjbuild")
            return false;

        var self = this;

        switch (message.action) {
            case "onBuild":
                this.loadSettings(user, function(err, settings) {
                    if (err) {
                        // FIXME: howto send/receive via through client
                        console.log("loading config error");
                    } else {
                        self.build (settings,{shell:message.shell,
							 argv:message.argv,
							  key:message.key_var},
							 function(e,msg){
							if(e){
								console.log(e);
								self.log(-1,e);
								return;
							}else{
								console.log(msg);
								self.log(0,msg);
							}
						});
                    }
                });
							
                break;
		}
        return true;
    };

    this.log = function(level, description) {
        var msg = {};

        msg.extra = "pjbuild";
        msg.type = "log";
        msg.level = level;
        msg.message = description;

        this.ide.broadcast(JSON.stringify(msg), this.name);
    };

    this.result = function (code, message, action) {
        var msg = {};

        msg.code = code;
        msg.extra = "pjbuild";
        msg.type = "result";
        msg.action = action;
        msg.message = message;

        this.ide.broadcast(JSON.stringify(msg), this.name);
    };
	
	this.build = function(settings,argObj,callback){
		
		//console.log(settings);
		var doc = new xmldom.DOMParser ().parseFromString (settings);
        var pjfilesObj = doc.getElementsByTagName ("pjbuildfile");
		var doObj;
		var shell;
		var args;
		
		for(var i=0;i<pjfilesObj.length;i++){
			if(pjfilesObj[i].getAttribute("key_var") == argObj.key){
				doObj = pjfilesObj[i];
				break;
			}
		}
		
		if(doObj){
			args = doObj.getAttribute("argv").split(" ");
			shell = doObj.getAttribute("shell");
		}
					
		//var args = argObj.argv.split(" ");
		var dir = "";
		
		if(shell == ""){
			callback("the shell command is not given");
			return;
		}
	
		//console.log(ide.workspaceDir);
		child.execFile(shell, args, {cwd:dir}, function(err, stdout, stderr) {
			callback(stderr,stdout);
		});
		return;
	};
	
	this.loadSettings = function(user, callback) {
        console.log("load settings", this.settingsPath);
        var self = this;
        fs.exists(this.settingsPath, function(exists) {
            if (exists) {
                self.fs.readFile(self.settingsPath, "utf8", function(err, settings) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    callback(err, settings);
                });
            }
            else {
                callback("settings file does not exist", "");
            }
        });
    };

}).call(PjbuildPlugin.prototype);
