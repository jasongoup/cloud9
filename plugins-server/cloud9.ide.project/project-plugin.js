
"use strict";
var util   = require("util");
var fsnode = require("vfs-nodefs-adapter");
var Plugin = require("../cloud9.core/plugin");
var assert = require("assert");
var xmldom = require ("xmldom");
var fs     = require ("fs.extra");
var child  = require ("child_process");
var S = require ('string');

var name   = "project";
var EventBus;
var ProcessManager;
var SETTINGS_PATH;

module.exports = function setup(options, imports, register) {
     assert(options.settingsPath, "option 'settingsPath' is required");
      SETTINGS_PATH = options.settingsPath;
      ProcessManager = imports["process-manager"];

      EventBus = imports.eventbus;
     imports.ide.register(name, ProjectPlugin, register);


};

var ProjectPlugin = function(ide, workspace) {
	
     Plugin.call(this, ide, workspace);
     this.pm = ProcessManager;
     this.hooks = ["command"];
     this.eventbus = EventBus;
     this.name = "project";
     this.settingsPath = SETTINGS_PATH;
     this.fs = fs;
     this.reposPath = workspace.workspaceDir;

};

util.inherits(ProjectPlugin, Plugin);

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
    };


    this.log = function(level, description) {
        var msg = {};

        msg.extra = "project";
        msg.type = "log";
        msg.level = level;
        msg.message = description;

        this.ide.broadcast(JSON.stringify(msg), this.name);
    };

    this.result = function (code, message, action) {
        var msg = {};

        msg.code = code;
        msg.extra = "project";
        msg.type = "result";
        msg.action = action;
        msg.message = message;

        this.ide.broadcast(JSON.stringify(msg), this.name);
    };

    this.command = function(user, message, client) {
        if (message.command != "project")
            return false;
        var self = this;
        switch (message.action) {
            case "gitclone":
                self.gitclone (message.project,message.type,client);
                break;
			case "gitinit":
				self.gitInit(message.project);
				break;
			case "gitlist":
				self.gitList(message.project);
				break;

			case "gitcommit":
				self.Commit(message.project,message.fileshash,message.note);
				break;

			case "gitrm":
				self.gitRm(message.project,message.filearray);
				break;

			case "gitremotecommit":
				self.gitRemoteCommit(message.project,message.url);
				break;

			default:
				break;
        }

        return true;
    };
	
	this.gitInit = function(proj){
		var self = this;
		var args = ["init"];
		  if(proj==null||proj==="")
                         self.result (-1, "the project catalog is not exist", "gitinit");
		var dir = this.reposPath + "/" + proj;
		
		//console.log(projectDir);
		child.execFile('git', args, {cwd:dir}, function(err, stdout, stderr) {
			if (err) {
				self.result (-1, stderr, "gitinit");
			}else {
				console.log ("git init:" + stdout);
				
				self.result (0, stdout, "gitinit");
			}
		});
	};

	this.gitRemoteCommit = function(proj,url){

		var self = this;
                var args = ["push"];

                if(proj==null||proj==="")
                         self.result (-1, "the project catalog is not exist", "gitremotecommit");
		if(url==null||url=="")
			self.result(-1,"the remote url  is  empty","gitremotecommiit");

		args.push(url);

                var dir = this.reposPath + "/" + proj;
		console.log("enter the gitremotecommit" + url +  "project");


		return ;
                //console.log(projectDir);
                child.execFile('git', args, {cwd:dir}, function(err, stdout, stderr) {
                        if (err) {
                                self.result (-1, stderr, "gitremotecommit");
                        }else {
                                console.log ("gitremotecommit:" + stdout);

                                self.result (0, stdout, "gitremotecommit");
                        }
                });

	};
	

	this.getfilearray =function(fileshash,type,flag)
	{	
		var self = this;
		var filearray=[];
		   for(var  name in fileshash){

                        if(fileshash[name]!=null && fileshash[name].length>0){

                                        if(fileshash[name]===type && flag){
						
						filearray.push(name);
					}
					else{
						if(!flag && fileshash[name]!=type){

							filearray.push(name);
						}
					}
                        }
                }
		return filearray;

	}

	this.gitCommit = function(proj,note){
		
		 var self = this;
		
		var args = ["commit"];
                args.push("-a");
		args.push("-m");
                args.push(note);
                if(proj==null||proj==="")
                         self.result (-1, "(gitCommit)the project catalog is not exist", "gitcommit");
                //var dir = this.reposPath + "/" + proj;         
                var dir = "/home/jason/program/cloud/cloud8_7/cloud9";

		console.log("enter into gitCommit");		
		console.log("note=" +note);

                child.execFile('git', args, {cwd:dir}, function(err, stdout, stderr) {
                        if (err) {
                                self.result (-1, stderr, "gitcommit");
                        }else {
                                console.log ("git commit:" + stdout);
                                self.result (0, stdout, "gitcommit");
			
                        }
                });


	}	


	
	
	this.Commit = function(proj,fileshash,note){
		 var self = this;
		 //var  deletefilearray = [];
		 var  addfilearray=[];
		//deletefilearray=self.getfilearray(fileshash,"deleted",true);
		addfilearray = self.getfilearray(fileshash,"addfile",true);
		console.log("-------------------------------------------------------");
		/*
		for(var i=0;i<deletefilearray.length;i++){
			console.log("++++++++++"+deletefilearray[i]);
		}
		*/	
		for(var i=0;i<addfilearray.length;i++){
                        console.log(">>>>>>>>>>>"+addfilearray[i]);
                }
		console.log("node=" +note);		

		//self.gitRm(proj,filearray);
		self.gitAdd(proj,addfilearray,note);


	}
	

	 this.gitAdd = function(proj,filearray,note) {

                var self = this;
                var args = ["add"];

                if(proj==null||proj==="")
                         self.result (-1, "(gitAdd)the project catalog is not exist", "gitadd");
                //var dir = this.reposPath + "/" + proj;
		var dir = "/home/jason/program/cloud/cloud8_7/cloud9";

                if(filearray==null|filearray.length==0)
                                        self.result (-1, "(gitAdd)the files number is empty", "gitadd");

                for(var i=0;i<filearray.length;i++){

                        args.push(filearray[i]);
                }
                child.execFile('git', args, {cwd:dir}, function(err, stdout, stderr) {
                        if (err) {
                                self.result (-1, stderr, "gitadd");
                        }else {
                                console.log ("git add:" + stdout);

				self.gitCommit(proj,note);

                               // self.result (0, stdout, "gitrm");
                        }
                });

        }




	this.gitRm = function(proj,filearray) {

		var self = this;
		var args = ["git "];
                args.push("rm ");
		
		if(proj==null||proj==="")
			 self.result (-1, "(gitRm)the project catalog is not exist", "gitrm");
		var dir = this.reposPath + "/" + proj;
		if(filearray==null|filearray.length==0)
			 		self.result (-1, "(gitRm)the files number is empty", "gitrm");

		for(var i=0;i<fileArray.length;i++){
                               
			args.push(filArray[i]);
		}
		child.execFile('git', args, {cwd:dir}, function(err, stdout, stderr) {
                        if (err) {
                                self.result (-1, stderr, "gitrm");
                        }else {
                                console.log ("git rm:" + stdout);

                               // self.result (0, stdout, "gitrm");
                        }
                });

	}

	this.gitList = function(proj){
		var self = this;
		var args = ["status"];
		//var dir = this.reposPath +"/"+proj;
		var dir = "/home/jason/program/cloud/cloud8_7/cloud9";
		child.execFile('git',args,{cwd:dir},function(err,stdout,stderr) {
			
			if(err){
				self.result(-1,stderr,"gitstatus");
			}else {
			 	 console.log ("git list:" + stdout);
				 var fileshash = {};
				 var flag = 0;
				 var count = 0;

				 if(!S(stdout).startsWith("fatal")){	
					 var content = stdout.toString ();

					 content.split ('\n').map (function (line){
						
					  console.log("line ="+ line +"\n");
					  var result= S(line);
					  var pair = undefined;
			                  var name = undefined;
					if(result.include('modified:')){
						pair = line.split("modified:",2);
						if(pair.length==2){
							
							name = S(pair[1]).trim().s;
							fileshash[name] = "modified";
						}

					}else if(result.include('deleted:')){
						pair = line.split("deleted:",2);
						if(pair.length==2){
							name = S(pair[1]).trim().s;
							fileshash[name]="deleted";
						
						}
					}else if(result.include("Untracked files:")){
						flag = 1;
						count=100;
							
					}
					if(flag==1){
						count++;
						if(count!=101 && count!=102 && count!=103){
							
							if(S(result).startsWith("#")){
								name=S(result).chompLeft('#').trim();
									if(name!=undefined && name!="" && name.length>0);
										fileshash[name] ="addfile";
								}
							
							}

						}
					
					});

					for(var  kvp in fileshash){
               					 console.log("kvp=" + kvp+"\n");
               					 console.log("packages[]"+fileshash[kvp]+"\n");

            					}
					 self.result (0, fileshash, "gitlist");	

				}
				else
					 self.result(-1,stdout,"gitlist");
			}
		});
	}

    this.gitclone = function (proj,type,client) {
        var self = this;

    	var args = [];
		var dir = "";

		args.push("http://www.163.com");
	
		console.log("enter the git  \n");
		dir = this.reposPath +"/"+proj;
		console.log("path="+dir+"\n");
		console.log("type="+type+"\n");

        child.execFile('wget', args, {cwd:dir}, function(err, stdout, stderr) {
            if (err) {
                self.result (-1, stderr, "gitclone");
		console.log("stderr"+stderr + "gitclone"+"\n");
            } else {
                console.log ("index updated:" + stdout);
                self.result (0, stdout, "gitclone");
            }
        });
	
    };


}).call(ProjectPlugin.prototype);

