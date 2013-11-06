/**
 * project's page code Module
 * @author DengJianYong
 */

define(function(require, exports, module) {

	var ide = require("core/ide");
	var ext = require("core/ext");
	var util = require("core/util");
	var settings = require("core/settings");
	var commands = require("ext/commands/commands");
	var editors = require("ext/editors/editors");
	var markup = require("text!ext/project/project.xml");
	var GitEngine = require("ext/project/gitengine");
	var project = require("ext/project/project");
	var Console = require ("ext/console/console");
	var pkgmgr = require("ext/pkgmgr/pkgmgr");
	var menus = require("ext/menus/menus");
	var css = require("text!ext/project/project.css");


	function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    function guid() {
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }

	require("ext/main/main"); //Make sure apf is inited.
	
	module.exports = ext.register("ext/project/project_page", {
		dev         : "Sinobot",
		name        : "ProjectPage",
		alone       : true,
		type        : ext.GENERAL,
		deps        : [],
		offline     : false,
		markup      : markup,
		autodisable     : ext.ONLINE | ext.LOCAL,
		worker      : null,
		css         : util.replaceStaticPrefix(css),
	
		currentSettings : [],
		nodes       : [],

		gitEngine : new GitEngine(),    
	
		ignoreFiles: [".", ".DS_Store"],
		
		model: new apf.model(),

		autocommitFlag:1,
	
		init : function(){
			if (ide.readonly)
            	return;
			var _self = this;
			 _self.gitEngine.init (ide);
			apf.importCssString(_self.css);
			
			menus.addItemByPath("Tools/Git/GitProjectCommit", new apf.item({
				onclick : function(){
					_self.gitCommitShow();
				},
			}), 499);

		 	menus.addItemByPath("Tools/Git/GitRemotePush", new apf.item({
                                onclick : function(){
                                        _self.gitRemoteShow();
                        },}),500);
		
		commitFiles.setModel (_self.gitEngine.model);	



		ch1.addEventListener("click",function(e){

			
			var value = ch1.value;
			if(value==="full"){
				commitFiles.checkAll("true");

			}else{
				commitFiles.clearChecked(true);
			
			}
		});
		

		ch2.addEventListener("click",function(e){

			var _self = this;
			var value = ch2.value;
			if(value==="full"){
				
				_self.autocommitFlag = 1;
					
			}else{
				_self.autocommitFlag = 0;
			}

		});

		},
		

		gitRemoteShow:function() {
			gitRemotePage.show();

		},
		
		gitCommitShow : function () {
			var _self = this;
			
			var name =  trFiles.selection[0].attributes.name.value;
			if(name==null)
				 Consle.log("<font color=ff0000>select project name is empty</font> <br>"); 
			_self.gitEngine.gitList(name,function(msg){

                                        Console.log("git list the project...\n");
                                        if(msg.code ==0){
						 var  flag = 0;
						  var list =commitFiles.getTraverseNodes();
						  for(var i=0;i<list.length;i++){

								if(list[i].getAttribute("name")==="")
										commitFiles.remove(list[i]);
						  }
								
                       
						commitFiles.reload();
						commitFiles.checkAll("true");
                                                Console.log("gitList success <br>");

					}

                                        else
                                                 Console.log("<font color=ff0000>git List faild</font> <br>");

            });
			//commitFiles.reload();
			gitCommitPage.show();
		},

		gitRemoteCommit:function() {
		
			var  _self = this;

			var name =  trFiles.selection[0].attributes.name.value;
                        if(name==null){
                                 Consle.log("<font color=ff0000>select project name is empty</font> <br>");
				 return ;
			}
			

			var url = remoteurlTxt.value;
			if(url==""){
				  Consle.log("<font color=00ff00>url  is empty</font> <br>");
				  return ;
			}
			
			_self.gitEngine.gitRemoteCommit(name,url,function(msg){

                                        if(msg.code == 0)
                                                Console.log("gitRemotePush success <br>");
                                        else
                                                Console.log("<font color=ff0000>gitRemotePush  faild</font> <br>");

            });
			
		},
		gitCommit:function(){

			var _self = this;
			var name =  trFiles.selection[0].attributes.name.value;
                        if(name==null)
                                 Console.log("<font color=ff0000>select project name is empty</font> <br>");

			var note =  commitTxt.value; 
			if(note==null||note==""){

				 Console.log("<font color=ff0000>the note  is empty</font> <br>");
				 util.alert("Message", "message", "the note is empty");
				 return ;
			}
			var fileshash ={} ;
			
			for(var i=0;i<commitFiles.checklength;i++){
					
					var name = commitFiles.$checkedList[i].attributes.name.value;
					var filestatus = commitFiles.$checkedList[i].attributes.status.value;
					if(filestatus!=null && filestatus.length>0){
								
						fileshash[name] = filestatus;
					}

			}
	
			_self.gitEngine.gitCommit(name,note,fileshash,function(msg){
					if(msg.code == 0){
                                                Console.log("git Commit success <br>" +msg.message);

						if(_self.autocommitFlag==1){
						
							
							_self.gitRemoteCommit();
						}
			
					}
                                        else
                                                Console.log("<font color=ff0000>git commit faild</font> <br>");

			});

		},
		projectWizard : function(){
			var data = "<datas><data name='General' value='1'></data><data name='Example 2' value='2'></data></datas>";
			var node = apf.getXml(data);
			var newProjectTypeModel = new apf.model();
			newProjectTypeModel.load(node);
			pjWizardDialog.setAttribute("model", newProjectTypeModel);
			pjWizardDialog.show();
			wizardTab1.set(0);
		},

		pkgcreateProject:function(name){
		

			var props = {name: "", path: "/tmp/abc", guid: guid()};

                	props.name = name;
               		pkgmgr.projIndex++;
                	while(true){
                        //if(self.projIndexStatus==1)
                        //      break;
                        	if(!pkgmgr.isProjectExtence(pkgmgr,props)){

                                	 props = {name: "", path: "/tmp/abc", guid: guid()};
                                 	props.name = "project" + name+pkgmgr.projIndex;
                                 	pkgmgr.projIndex++;
                        	}
                        	else
                                	break;
                	}
                	pkgmgr.addProject(pkgmgr, props);

	
		},

		createProject : function (name){
			var _self = this;

			var sel = newProjectType.getSelection();
            		var pkgs = [];
			if(sel==null || sel.length==0){				
				Console.log("You have not select the Project type \n");
				return;
			}

            		var type = sel[0].getAttribute ("value");
			Console.log("Create the project start... <br>");
			
			project.createProject(name,"","",function(f){  

				Console.log("-- Create the project main directory <br>");

				if(f == null || f == undefined){				
					 Console.log("create project failure <br>");
					 return;
				}

				_self.pkgcreateProject(name);

				Console.log("-- initializing the Git...");
				_self.gitEngine.gitInit(name,function(msg){
					if(msg.code == 0)
						Console.log("success <br>");
					else
						Console.log("<font color=ff0000>faild</font> <br>");
				});
				
				if(!Copycheckbox.value){	
					return ;
				}
				 _self.gitEngine.gitclone(name,type, function(message){
					
					Console.log("-- copy demo into the project directory...");
					if(message.code == 0)
						Console.log("success <br>");
					else
						Console.log("<font color=ff0000>faild</font> <br>");

             	});
				
			});
		}
	});

});
