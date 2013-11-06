/**
 * Package Manager Module for the Cloud9 IDE
 *
 * @copyright
 * @license
 */

define(function (require, exports, module) {
    var ide = require("core/ide");
    var ext = require("core/ext");
    var util = require("core/util");
    var Panels = require("ext/panels/panels");
    var Settings = require("ext/settings/settings");


    var settings = require("core/settings");
    var Menus = require("ext/menus/menus");
//    var Dock = require("ext/dockpanel/dockpanel");
    var Commands = require("ext/commands/commands");

    var Console = require ("ext/console/console");

    var markup = require("text!ext/pkgmgr/pkgmgr.xml");
    var skin = require("text!ext/pkgmgr/skin.xml");
    var css = require("text!ext/pkgmgr/style.css");
    var markupSettings = require("text!ext/pkgmgr/settings.xml");
	
    var anims = require("ext/anims/anims");

    /*global stProcessRunning, barTools, mnuContextTabs, btnPkgMgr, tabEditors, mnuCtxEditor,
     mnuCtxEditorRevisions, lstPackage, btnPkgMgrDbgRun, mnuPkgMgr, txtCmdArgs, trFiles, ddPkgTypeSelector*/

    var OpkgClient = require("ext/pkgmgr/opkg-client");
    var OpkgEngine = require("ext/pkgmgr/opkg-repos");
    var OpkgEngine2 =  require("ext/pkgmgr/opkg-repos2");

    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    function guid() {
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }

    var $name = "ext/pkgmgr/pkgmgr";

    var errArray = new Object();
    errArray['addProject'] ={"name":"project with same path already exists","color":"#00FF00"};
    errArray['txtProject'] ={"name":"project  text is  empty","color":"#00FF00"};
    errArray['sourcefile'] ={"name":"source filename  is  empty","color":"#00FF00"};
    errArray['packagename'] ={"name":"packagename  is  empty","color":"#00FF00"};
    errArray['addPackage'] = {"name":"append node failed","color":"#00FF00"};
    errArray['addPackage1'] = {"name":"has not select the project","color":"#00FF00"}; 
    errArray['addFileToPkgFile'] = {"name":"Invalid source file ","color":"#0000FF"};
    errArray['addFileToPkgFilelen'] = {"name":"Duplicate file ","color":"#0000FF"};
    errArray['onBuildindex']={"name":"indexed","color":"#FFFFFF"};
    errArray['onBuildSuccess' ]={"name":"build successful. indexing ...","color":"#00FF00"};
    errArray['onBuildFailure' ]={"name":"build failed:","color":"#FF0000"};
    errArray['onInstallSuccess']={"name":"Install Success","color":"#00FF00"};
    errArray['onInstallFailure'] = {"name":"Install Failure","color":"#FF0000"};
    errArray['onUninstallSuccess']={"name":"Uninstall Success","color":"#00FF00"};
    errArray['onUninstallFailure'] = {"name":"Uninstall Failure","color":"#FF0000"};

    errArray['attachipSuccess']={"name":"connect success","color":"#00FF00"};
    errArray['attachipFailure']={"name":"connect failure","color":"#FF0000"};
    errArray['deattachipSuccess']={"name":"deattach success","color":"#00FF00"};   
    errArray['configureUrlFailure']={"name":"configure url failure","color":"#FF0000"};
    errArray['configureUrlSuccess']={"name":"configure url success","color":"#00FF00"};
    errArray['updateListFailure']={"name":"update list failure","color":"#FF0000"};
    errArray['updateListSuccess']={"name":"update Packagelist success","color":"#00FF00"};
   
   
	
    




    module.exports = ext.register($name, {
        name: "Package Manager",
        dev: "Ajax.org",
        type: ext.GENERAL,
        alone: true,
        skin: {
            id: "pkgmgr",
            data: skin,
            "media-path": ide.staticPrefix + "/ext/pkgmgr/style/images/",
            "icon-path": ide.staticPrefix + "/ext/pkgmgr/style/icons/"
        },
        offline: false,
        autodisable: ext.ONLINE | ext.LOCAL,
        markup: markup,
        deps: [],

        defaultWidth: 480,

        projProps: ["name", "guid", "version", "author", "url", "path", "destdir", "comment"],
        packageProps: ["proj", "name", "depends", "type", "files"],
        serviceProps: ["proj", "name", "exec", "param", "depends", "oneshot"],
        fileProps: ["name", "dest", "mode", "user", "group"],

        nodes: [],
        model: new apf.model(),

        projIndex: 1,


        disableLut: {
            "terminal": true
        },
	lstPkg1_flag: 0,	

	ddProjectSelectorRefreshFlag:0,
	
        opkgSrv: new OpkgClient (),

        opkgEngine: new OpkgEngine (),

	opkgEngine2: new OpkgEngine2 (),
	
	r:[],


	packageArray:[],
	packageArray1:[],
	
	
	componentShow:function(flag){
	if(flag==-1){
		projecttable.setProperty("visible", "false");
                lboutput.setProperty("visible", "false");
                txtdirectory.setProperty("visible", "false");
                divider_line.setProperty("visible", "false");
	}
        else{
		projecttable.setProperty("visible", "true");
                lboutput.setProperty("visible", "true");
                txtdirectory.setProperty("visible", "true");
                divider_line.setProperty("visible", "true");
        }


        },


        hook: function () {
            var self = this;
            this.markupInsertionPoint = colLeft;

            // Register this panel on the left-side panels
            Panels.register(this, {
                position : 1500,
                caption: "Opkg Settings",
                "class": "testing",
                command: "openopkgpanel"
            });

            Commands.addCommand({
                name: "openopkgpanel",
                hint: "show the Opkg panel",
                //bindKey: {mac: "Command-U", win: "Ctrl-U"},
                exec: function () {
                    self.showOpsPanel();
                }
            });

	    /* 
            Menus.$insertByIndex(barTools, new apf.splitbutton({
                id              : "btnPkgMgr",
                skin            : "run-splitbutton",
                checked         : "false",
                icon            : "run.png",
                caption         : "Opkg",
                command         : "show",
                visible         : "true",
                disabled        : "{!!!ide.onLine}",
                "class"         : "stopped",
                "disabled-split": "0",
                submenu         : "mnuPkgMgr"
            }), 200);
	      */	

            /* what does this mean ? */
            this.nodes.push(
                this.model = new apf.model().load("<pkgmgr/>"),
                //this.repos = new apf.model().load("<repository></repository>"),
                Menus.addItemByPath("Project/~", new apf.divider(), 200000),
                Menus.addItemByPath("Project/Opkg/", new apf.menu(), 200001),
                Menus.addItemByPath("Project/Opkg/Deploy...", new apf.item({
                    onclick : function(){
                        self.showOpkgDlg();
                    }
                }), 200)
            );

            // add content to preference side panel
            Settings.addSettings("PIA Settings", markupSettings);

            ide.addEventListener("settings.load", function (e) {
                // TODO: setup default
                Settings.setDefaults("pkgmgr", [
                    ["autohide", "true"]
                ]);
                var rootnode = e.model.queryNode("//settings/pkgmgr");

                self.model.load(rootnode);
            });

            ext.initExtension(this);

        },

        init: function (amlNode) {
            if (ide.readonly)
                return;
            var self = this;

            this.panel = winOpkgProject;
            this.nodes.push(winOpkgProject);

            self.opkgEngine.init (ide);
	    
	    self.opkgEngine2.init(ide);

            apf.importCssString(css);
	
	   self.componentShow(-1);
		
	   
	txtProject.addEventListener("keyup",function(e){
		var text = txtProject.getValue();
		if(text==="" || text==null){
			txtProject.setValue("unnamed");
			//util.alert("txtProject", "txtProject", errArray["txtProject"]["name"]);
		}
	});

	 txtProject.addEventListener("blur",function(e){
                var text = txtProject.getValue();
                if(text==="" || text==null){
                        txtProject.setValue("unnamed");
                        //util.alert("txtProject", "txtProject", errArray["txtProject"]["name"]);
                }


        });

	 tbSource.addEventListener("keyup",function(e){
                var text = tbSource.getValue();
                if(text==="" || text==null){
                        tbSource.setValue("unnamed");
                        //util.alert("txtProject", "txtProject", errArray["txtProject"]["name"]);
                }


        });

	tbSource.addEventListener("blur",function(e){
                var text = tbSource.getValue();
                if(text==="" || text==null){
                        tbSource.setValue("unnamed");
                        //util.alert("txtProject", "txtProject", errArray["txtProject"]["name"]);
                }
        });
	
	tbSource1.addEventListener("keyup",function(e){
		var text = tbSource1.getValue();
                if(text==="" || text==null){
			tbSource1.setValue("unnamed");
                        //util.alert("sourefile", "sourcefile", errArray["sourcefile"]["name"]);
                }

           });

	 tbSource1.addEventListener("blur",function(e){
                var text = tbSource1.getValue();
                if(text==="" || text==null){
                        tbSource1.setValue("unnamed");
                        //util.alert("sourefile", "sourcefile", errArray["sourcefile"]["name"]);

                }

           });


	txtPkgName.addEventListener("keyup",function(e){
            	var text = txtPkgName.getValue();
            	if(text==="" || text==null){	
			txtPkgName.setValue("unnamed");
                        //util.alert("packagename", "packagename", errArray["packagename"]["name"]);

            	}

           });

	txtPkgName.addEventListener("blur",function(e){
                var text = txtPkgName.getValue();
                if(text==="" || text==null){
                        txtPkgName.setValue("unnamed");
                        //util.alert("packagename", "packagename", errArray["packagename"]["name"]);

                }

		self.packageArray.push(text);
		 Console.pkglog(errArray["onBuildindex"]["color"],"txtPkgName",text);
		 settings.save(true);	
	

           });

	ddProjectSelector.addEventListener("beforeselect", function (e) {

                lstPackage.clear();
                rightpanel.setProperty("visible", "false");
	});
			
	ddProjectSelector.addEventListener("afterselect", function (e) {

                var xmlNode = e.selected;

                if (!xmlNode){

		    self.componentShow(-1);
                    return;
		}
		
		self.componentShow(0);
                var activeNodes = self.model.queryNodes("./project[@active='true']");
                for (var i = 0; i < activeNodes.length; i++) {
                    apf.xmldb.removeAttribute(activeNodes[i], "active");
                }
                apf.xmldb.setAttribute(xmlNode, "active", "true");

                var pkgs = self.model.queryNodes("./project[@active='true']/package[@active='true']");
                for (var i = 0; i < pkgs.length; i++) {
                    apf.xmldb.removeAttribute(pkgs[i], "active");
                }
            });

            lstPackage.addEventListener("click", function (e) {
                var xmlNode;
                if (e.htmlEvent.target.className == "radiobutton") {
                    // radio button clicked, set configuration as 'active'
                    var active = self.model.queryNode("project[@active='true']/package[@active='true']");
                    xmlNode = apf.xmldb.findXmlNode(e.htmlEvent.target.parentNode);
                    if (active && active !== xmlNode)
                        apf.xmldb.removeAttribute(active, "active");
		    
			
                } else if (e.htmlEvent.target.className == "btnDelete") {
                    xmlNode = apf.xmldb.findXmlNode(e.htmlEvent.target.parentNode);
		    var t = xmlNode.getAttribute("name");

		    for(var i=0;i<self.packageArray1.length;i++){
			if(self.packageArray1[i]===t)
				break;
		    }
		    if(i==self.packageArray1.length)
		    	self.packageArray1.push(t);

                    this.remove(xmlNode);

                    lstPackage.stopRename();
                }
            });

            lstPackage.addEventListener("beforeselect", function (e) {
                var xmlNode = e.currentTarget.selected;
                // here goes what needs to happen when a run config is selected
                if (xmlNode){
                    apf.xmldb.removeAttribute(xmlNode, "active");
		   
		}
			
            });

            lstPackage.addEventListener("afterselect", function (e) {
                // IMPORTANT: there might no node selected (yet), so assume that `xmlNode`
                // may be empty.
                var xmlNode = e.selected;
                if (!xmlNode){
		    //componentShow(false);
                    return;
		}
		//componentShow(true);
                // here goes what needs to happen when a run config is selected
	//	toggleDialog(1);
		
                apf.xmldb.setAttribute(xmlNode, "active", "true");
                var t = xmlNode.getAttribute("type");
                if (!t) {
                    t = "default";
                    xmlNode.setAttribute("type", t);

                }
                ddPkgTypeSelector.select(t);

		var m = xmlNode.getAttribute("prio");
		if(!m) {
			
		    m = "optional";
		    xmlNode.setAttribute("prio", m);
			

		}
		ddPkgfPriorityTypeSelector.select(m);

		 var n = xmlNode.getAttribute("arch");
                if(!n) {

                    n = "all";
                    xmlNode.setAttribute("arch", n);


                }
		ddPkgArchTypeSelector.select(n);


		 for(var i=0;i<self.packageArray.length;i++){
                                if(xmlNode.getAttribute("name")===self.packageArray[i])
                                        break;
                 }
                 if(i==self.packageArray.length)
                      self.packageArray.push(xmlNode.getAttribute("name"));




                rightpanel.setProperty("visible", "true")
                //btnPkgInstall.enable ();

		lstFilesV1.load(xmlNode);
            });
			
		lstFilesV1.addEventListener("afterselect" , function (e){
				var selObj = lstFilesV1.getSelection();
				var eObj = e;
				if(selObj.length == 1)
					btnChangeF.enable();
				else
					btnChangeF.disable();
				
				
				if(selObj.length >= 1)
					btnRemoveF.enable();
				else
					btnRemoveF.disable();
					
				btnRemoveF.addEventListener("click" , function (f_e){
					var selObj = lstFilesV1.getSelection();
					for(var i=0; i<selObj.length; i++)
                    	lstFilesV1.remove(selObj[i]);
					
				});
			});

            btnAddProject.addEventListener("click", function (e) {
                // FIXME: get current directory
                var props = {name: "", path: "/tmp/abc", guid: guid()};

                props.name = "project" + self.projIndex;
                self.projIndex++;
		while(true){
			//if(self.projIndexStatus==1)
			//	break;
				
			if(!self.isProjectExtence(self,props)){

				 props = {name: "", path: "/tmp/abc", guid: guid()};
				 props.name = "project" + self.projIndex;
				 self.projIndex++;
			}
			else
				break;
		}
                self.addProject(self, props);

		// settings.save(true);
		ddProjectSelector.reload();

            });

            btnRemoveProject.addEventListener("click", function (e) {
                var xmlNode = ddProjectSelector.selected;
		// var self = this;
                if (xmlNode) {
                    console.info(xmlNode);
                    ddProjectSelector.remove(xmlNode);
                }


		self.componentShow(-1);
                lstPackage.clear();
                btnPkgInstall1.disable ();
            });

            ddPkgTypeSelector.addEventListener("afterselect", function (e) {
                if (!lstPackage.selected) {
                    return;
                }

                if (!e.selected)
                    return;

                var val = e.selected.getAttribute('value');
                if (val === 'service') {
                    //  mytab.add('Service', 'servicePage');
                    //  servicePage.replaceMarkup (serviceui);
                    vbService.show();
                } else {
                    vbService.hide();
                }

                lstPackage.selected.setAttribute("type", val);
            });

	   ddPkgfPriorityTypeSelector.addEventListener("afterselect", function (e){

		if (!lstPackage.selected) {
                    return;
                }

		if (!e.selected)
                    return;

		 var val = e.selected.getAttribute('value');
		
		lstPackage.selected.setAttribute("prio", val);
		
	 });

	    ddPkgArchTypeSelector.addEventListener("afterselect", function (e){

                if (!lstPackage.selected) {
                    return;
                }

                if (!e.selected)
                    return;

                 var val = e.selected.getAttribute('value');

                lstPackage.selected.setAttribute("arch", val);

         });



/*
            btnPkgInstall.addEventListener("click", function (e) {
                var sel = lstPackage.getSelection();
                var pkgs = [];

                for (var i = 0; i < sel.length; i ++) {
                    var pkg = sel[i];
                    pkgs.push (pkg.getAttribute ("name"));
                }

                self.opkgSrv.install (pkgs.join (' '), function (code, data, error) {
                    // TODO: report success or failure
                    console.log ("install returned: " + code + "; msg: " + data + "; error: " + error);
                });
            });
*/

            self.opkgSrv.on ("disconnect", function (reason) {
                btnAttachPIA.setCaption ("Attach");
				piapage.setAttribute("visible",false);
		//Console.pkglog(errArray["deattachipSuccess"]["color"],"connect client",errArray["deattachipSuccess"]["name"]);
            });

            self.opkgSrv.on ("connect", function (connection) {
                btnAttachPIA.setCaption ("Detach");
				Console.pkglog(errArray["attachipSuccess"]["color"],"connect client",errArray["attachipSuccess"]["name"]);
                // TODO: export opk files to public repository
                //var url = "http://" + ide.connection.socket.host + ":"
                  //  + ide.connection.socket.port + "/workspace/.opkg";
                // DEBUG:
               // console.log ("url " + url);
		piapage.setAttribute("visible",true);


		var url = txtUrl.value;

		if(url==null|url==""){
			 url = "http://" + ide.connection.socket.host + ":"+ ide.connection.socket.port + "/workspace/.opkg";
		}
			
	
		 self.opkgSrv.configure (url, function (code, data, error) {
                    if (code != 0) {
                             // TODO: report error
                        Console.pkglog(errArray["configureUrlFailure"]["color"],error,data);
                        return;
		   }
                });

	/*	
                self.opkgSrv.configure (url, function (code, data, error) {
                    if (code != 0) {
			     // TODO: report error
		 	Console.pkglog(errArray["configureUrlFailure"]["color"],error,data);
                        return;
                    }
		    
                    self.opkgSrv.list (undefined, function (code, data) {
                        console.log (arguments);
			
			if(code ==-1)
			{
				Console.pkglog(errArray["configureUrlFailure"]["color"],error,"-------" + data);
			}
                    });
		   
			
                    self.opkgSrv.update (function (code, data, error) {
                        if (code == -1) {
                            // TODO: report error
			   //Console.pkglog(errArray["updateListFailue"]["color"],error,data);
                            return;
                        }
                    });
		   Console.pkglog(errArray["updateListSuccess"]["color"]," ",errArray["updateList"]["name"]);	
			
                });
	*/	
	/*
	self.opkgSrv.configure (url, function (code, data, error) {
                    if (code != 0) {
                             // TODO: report error
                        Console.pkglog(errArray["configureUrlFailure"]["color"],error,data);
                        return;
                    }

	*/
		
		self.opkgSrv.list (null, function (code, data) {
                 //       console.log (arguments);
                        
                        if(code ==0){
				if(data!=null){
					 self.r =[];
					 for(var i in data){
	
						self.r.push(i);			
					}
				
					var list =lstPkg2.getTraverseNodes();
					for(var k=0;k<list.length;k++){
                                                 Console.pkglog(errArray["updateListSuccess"]["color"],"server_opk",list[k].getAttribute("name"));	
						  for(var i=0;i<self.r.length;i++){

							if(list[k].getAttribute("name")===self.r[i]){
								  
								  list[k].setAttribute("curver","installed");
								  break;
							}
						  }
					}	
					lstPkg2.reload();
				
					for(var i=0;i<self.r.length;i++){
						Console.pkglog(errArray["updateListSuccess"]["color"],"pia_opk",self.r[i]);
						

					}
					if(self.lstPkg1_flag==0){
						  self.opkgSrv.list (null, function (code, data){

							if(code==0){
								 Console.pkglog(errArray["updateListSuccess"]["color"],"","the first updateList success" );
							}
						});
						self.lstPkg1_flag=1;
					}
					
					lstPkg1.reload();
	
				}
				btnPkgInstall1.enable();
                         	//btnPkgUninstall.enable();
				//tabPkgmgr.getPage("piapage").enable();
				
                        }


			self.opkgSrv.update (function (code, data, error) {
                        	if (code == -1) {
                        	    // TODO: report error
                        	   //Console.pkglog(errArray["updateListFailue"]["color"],error,data);
                        	    return;
                        	}
                	});

                });


	//	});
		
	});

            // packages object
            self.opkgSrv.on ("list", function (args) {
                if (args.length == 1) {
                    var packages = args[0];
                    self.opkgEngine.setInstalled (packages);
		   // self.opkgEngine2.setInstalled (packages);
                }
            });
	   
	    self.opkgSrv.on ("list-installed", function (args) {
		console.log("list-installed:" +args.data);
		Console.pkglog(errArray["updateListSuccess"]["color"]," ","list-installed" +args.data);
		

	    });
	
	   self.opkgEngine2.on("list-result",function (args){

			 this.lstPkg2.reload();		
		});
		
	    /*
	    self.opkgSrv.on ("opkg-update", function (args) {
            

                console.log("opkg-update:" +args.data);
		Console.pkglog(errArray["updateListSuccess"]["color"]," ","opkg-update" +args.data);


            }); 
	

	
	   self.opkgSrv.on("opkg-configure",function (args) {

		if (args.length > 0) 
		{
			Console.pkglog(errArray["updateListSuccess"]["color"]," ",args.data);
			
		}
	   });
	   */	

            btnAttachPIA.addEventListener ("click", function (e) {
                if (self.opkgSrv.isConnected ()) {
                    self.opkgSrv.disconnect ();
					
					piapage.setAttribute("visible",false);
			
		     btnAttachPIA.setCaption ("Attach");
		     Console.pkglog(errArray["deattachipSuccess"]["color"],"connect client",errArray["deattachipSuccess"]["name"]);

		     btnPkgInstall1.disable();
          	     //btnPkgUninstall.disable();
		    // tabPkgmgr.getPage("piapage").disable();

                    return;
                }

                var addr = txtPiaAddr.value;
                if (!addr || addr === "")
                    return;

                var arr = addr.split (":");

                self.opkgSrv.connect( arr[0], (arr.length == 2) ? arr[1] : 0,
                    function (code, data, err) {
                        if (code == -1){
			    Console.pkglog(errArray["attachipFailure"]["color"],err,errArray["attachipFailure"]["name"] +", info"+data);
                            Console.pkglog ("connect failed: " + err);
			}
			else{
			    Console.pkglog(errArray["attachipSuccess"]["color"],"connect client",errArray["attachipSuccess"]["name"]);
			}
			
                    }
                );
		
		if (self.opkgSrv.isConnected ()){
			 Console.pkglog(errArray["attachipSuccess"]["color"],"connect client",errArray["attachipSuccess"]["name"]);
			 btnPkgInstall1.enable();
            		 //btnPkgUninstall.enable();
		}
	
            });


	   lstPkg1.addEventListener ("afterselect", function (e) {
                var sel = lstPkg1.getSelection();
                if (sel.length == 0) {
                    return;
                }
                var pkg = sel[0];
                var ver = pkg.getAttribute ("ver");
                var curver = pkg.getAttribute ("curver");

		btnPkgUninstall2.enable();	
	//	 btnPkgInstall1.enable ();
	//	 btnPkgUninstall.disable ();
		
		/*
                if (curver !== "") {
                    btnPkgUninstall.enable ();
                } else {
                    btnPkgUninstall.disable ();
                }

                if (ver != "" && curver !== ver) {
                    btnPkgInstall1.enable ();
                } else {
                    btnPkgInstall1.disable ();
                }
		*/

            });



            lstPkg2.addEventListener ("afterselect", function (e) {
                var sel = lstPkg2.getSelection();
                if (sel.length == 0) {
                    return;
                }
                var pkg = sel[0];
                var ver = pkg.getAttribute ("ver");
                var curver = pkg.getAttribute ("curver");
		
		 if (self.opkgSrv.isConnected ()){

		   btnPkgInstall1.enable ();
                   //btnPkgUninstall.disable ();

		}
		else{

		   btnPkgInstall1.disable ();
                   //btnPkgUninstall.disable ();

		}
            });
		
	   btnPkgUninstall2.addEventListener ("click", function () {
               self.onUninstall (lstPkg1);
            });		
	  
	    btnPkgInstall1.addEventListener ("click", function () {
                self.onInstall(lstPkg2);
            });
	/*
            btnPkgUninstall.addEventListener ("click", function () {
               self.onUninstall (lstPkg2);
            });
	*/
	    lstPkg2.setModel (self.opkgEngine2.model);
            lstPkg1.setModel (self.opkgEngine.model);
        },

        showOpkgDlg: function (callback) {
            
	    this.opkgEngine.list ();
	    this.opkgEngine2.list ();
	    btnPkgInstall1.disable();
	     
	    lstPkg2.reload();
		
	    opkDialog.show ();
	    
        },


	showMnuPkgMgrDlg:function(callback){
			
		var proj = ddProjectSelector.value;

		if (proj == null){
                	util.alert("addPackage", "select", errArray["addPackage1"]["name"]);
              		return;

           	}
			
		mnuPkgMgr.show();

		/*
		var tmp = lstPackage.getSelection();
                if(tmp!=null){

                        for(var i=0;i<this.packageArray.length;i++){
                                if(tmp[0].getAttribute("name")==this.packageArray[i])
                                        break;
                        }
                        if(i==this.packageArray.length)
                                this.packageArray.push(tmp[0].getAttribute("name"));
		}
                */
	
	},


        showOpsPanel : function(e) {
            if (!this.panel || !this.panel.visible) {
                Panels.activate(this);
                this.enable();
            }
            else {
                Panels.deactivate(null, true);
            }

            return false;
        },
        show: function () {		
	  var self = this;
        },

        enable: function () {
            this.$enable();
        },

        disable: function () {
            this.$disable();
        },

        destroy: function () {
            Panels.unregister(this);
            this.$destroy();
        },

	isProjectExtence: function (self, props) {
 	    var name = props['name'];
            var path = props['path'];

            if (!(name && path))
                return false;

            var projs = self.model.queryNodes('project[@name="' + name + '"]');
            if (projs.length > 0) {
              //  Console.pkglog("project with same name already exists:" + name);
                Console.pkglog(errArray["addProject"]["color"],"addProject",errArray["addProject"]["name"]+":"+name);
                return false;
            }

            projs = self.model.queryNodes('project[@path="' + path + '"]');
            if (projs.length > 0) {

               // util.alert("addProject", "add", errArray["addProject"]["name"]+":"+path);
              //  Console.pkglog(errArray["addProject"]["color"],"addProject",errArray["addProject"]["name"]+":"+path);
	
            }
	    return true;

	},

        addProject: function (self, props) {

            var proj = apf.n("<" + "project" + "/>");

            self.projProps.forEach(function (prop) {
		if(prop==="destdir")
		{
			 var path = ide.workspaceDir +"/"+props["name"];
			 proj.attr(prop, path|| "unset");
		}
		else
                	proj.attr(prop, props[prop] || "unset");
		//console.info(prop);	

            });

            console.info(proj.xml());
	    
	    //proj.xml.attributes.destdir.value = props.name;	

            var curproj = this.model.appendXml(proj.xml());

            //ddProjectSelector.reload ();
            ddProjectSelector.select(curproj);

	   // txtdirectory.value = ddProjectSelector.selected.getAttribute("name");
	   //txtdirectory.value = "8888888888888888888888888";

        },

	deleteProject:function(name){

		 var list =ddProjectSelector.getTraverseNodes();
                 for(var k=0;k<list.length;k++){
			
			if(list[k].getAttribute("name")===name)
			{
				var xmlNode = list[k];
				ddProjectSelector.remove(xmlNode);
				return true;
			}

		}
		return false;
	   /*	
	   var xmlNode = ddProjectSelector.selected;
                // var self = this;
                if (xmlNode) {
                    console.info(xmlNode);
                    ddProjectSelector.remove(xmlNode);
                }
           */

	},


        addPackage: function () {
            var props = {};

            var proj = ddProjectSelector.value;

            if (proj == null)
	    {
		//util.alert("addPackage", "select", errArray["addPackage1"]["name"]);
                return;

	    }

            //var curproj = this.model.queryNode('project[@name="' + proj + '"]');

            var tagName = "package";
            var cfg = apf.n("<" + tagName + "/>");
            this.packageProps.forEach(function (prop) {
                cfg.attr(prop, props[prop] || "unset");
            });

            cfg.attr("guid", guid());

            var parent = "project[@name='" + proj + "']";
            var node = this.model.appendXml(cfg.node(), parent);

            if (node) {
                lstPackage.select(node);
            } else {
                alert("append node failed");
		 util.alert("addPackage", "add", errArray["addPackage"]["name"]);
		 Console.pkglog(errArray["addPackage"]["color"],"addPackage",errArray["addPackage"]["name"]);	 
            }

            return node;
        },

        addFileToPkg: function () {
            if (!tbSource.value || tbSource.value === "") {
                alert ("Invalid source file");
		util.alert("addFileToPkg", "add", errArray["addFileToPkg_file"]["name"]);
		 Console.pkglog(errArray["addFileToPkg_file"]["color"],"addFileToPkg_file",errArray["addFileToPkg_file"]["name"]);
                return;
            }

            var path = "./project[@active='true']/package[@active='true']";
            var files = this.model.queryNodes (path + "/file[@src='" + tbSource.value + "']");
            if (files.length > 0) {
                alert ("Duplicate file '" + tbSource.value + "'");
		 util.alert("addFileToPkg", "add", errArray["addFileToPkg_filelen"]["name"] + tbSource.value);
		 Console.pkglog(errArray["addFileToPkg_filelen"]["color"],"addFileToPkg_filelen",errArray["addFileToPkg_filelen"]["name"]);
                return;
            }

            var f = apf.n("<file/>");
            f.attr ("src", tbSource.value);
            tbSource.clear ();
            f.attr ("dest", tbDest.value);
            tbDest.clear ();
            f.attr ("mode", tbMode.value);
            tbMode.clear ();
            f.attr ("owner", tbOwner.value || "root");
            tbMode.clear ();
            f.attr ("group", tbGroup.value || "root");
            tbGroup.clear ();

            var node = this.model.appendXml(f.node(), path);
            //filestab.set (pgFiles);
			mytab.set(filepage22);
			winPgAddFile.hide();
        },


        onBuild: function () {
            var proj = ddProjectSelector.value;

            if (!proj) {
                // TODO: prompt for project name
				alert('please select a project!');
                return;
            }
	    
	
            var self = this;

	    settings.save(true);

		
	   /*
            var self = this;
	    
	    for(var i=0;i<self.packageArray.length;i++){
			Console.pkglog(errArray["onBuildindex"]["color"],"aaaaaaaaaaa",self.packageArray[i]);
	
	    }
	    */

	 /*  
	    if(self.packageArray.length==0){
		
		var text = txtPkgName.getValue();
                if(text!=null)
                        this.packageArray.push(text);	

		var tmp = lstPackage.getSelection();
		if(tmp!=null)
			this.packageArray.push(tmp[0].getAttribute("name"));

	    }
	    else {
		
		var tmp = lstPackage.getSelection();
                if(tmp!=null){
			
			for(var i=0;i<this.packageArray.length;i++){
				if(tmp[0].getAttribute("name")==this.packageArray[i])
					break;
			}
			if(i==this.packageArray.length)
				this.packageArray.push(tmp[0].getAttribute("name"));
		}
		

	    }
		*/

	     var list =lstPackage.getTraverseNodes();
             		if(list==null||list.length==0){
                                for(var e=0;e<self.packageArray1.length;e++){

                                        if(self.packageArray1[e]===self.packageArray[i])
                                                break;

                                }
                                if(e==self.packageArray1.length)
				{
					if(self.packageArray[i]!=undefined)
                                        	self.packageArray1.push(self.packageArray[i]);
				}
                        }else {
			

	    	for(var i=0;i<self.packageArray.length;i++){
		 	//var list =lstPackage.getTraverseNodes();
                 	for(var k=0;k<list.length;k++){
				if(list[k].getAttribute("name") ===self.packageArray[i]){
					break;
				}
			}
			if(k==list.length){
				
				for(var m=0;m<self.packageArray1.length;m++){
					
					if(self.packageArray1[m]===self.packageArray[i])
						break;			

				}
				if(m==self.packageArray1.length)
					self.packageArray1.push(self.packageArray[i]);
			}	
	  	 }

	   }

				
	
	    for(var m=0;m<self.packageArray1.length;m++){


	 			
			 Console.pkglog(errArray["onBuildindex"]["color"],"packageArray1",self.packageArray1[m]);

		}		

            this.opkgEngine2.build (proj,self.packageArray1, function (message) {

		if(message==null||message==""){
			 util.alert("onBuild", "onBuildFailure", errArray["onBuildFailure"]["name"]);
			 return ;
		}

                if (message.code === 0) {
                    var s = "build successful. indexing ...";
		    
		    //Console.pkglog(errArray["onBuildSuccess"]["color"],"onBuildSuccess",errArray["onBuildSuccess"]["name"]);
                    //Console.pkglog ('<span style="color: #00FF00">' + s +  '</span><br>');

                    this.index (function (message) {
                        this.list ();
                        //alert ("indexed");
		     	Console.pkglog(errArray["onBuildindex"]["color"],"onBuildindex",errArray["onBuildindex"]["name"]);
                    });
                    //alert (s);
		    Console.pkglog(errArray["onBuildSuccess"]["color"],"onBuildSuccess",errArray["onBuildSuccess"]["name"]);
		    lstPkg2.reload();
                } else {
                    var s = 'build failed: ' + message.error;
                    //Console.pkglog ('<span style="color: #ff0000">' + s + '</span><br>');
		    Console.pkglog(errArray["onBuildFailure"]["color"],"onBuildFailure",errArray["onBuildFailure"]["name"]+message.error);

			
                    alert (s);
		     util.alert("onBuild", "onBuildFailure", errArray["onBuildFailure"]["name"]);
                }
		
            });

//            var request = {
//                command : "opkg",
//                action  : "build",
//                project : ddProjectSelector.value
//            };
//
//            if (!this.$onMessage) {
//                this.$onMessage = this.onMessage.bind(this)
//                ide.addEventListener("socketMessage", this.$onMessage);
//            }

//            ide.send (request);
//
            // ???:
//            ide.dispatchEvent("track_action", {type: "opkg"});
        },

        onInstall: function (lst) {
            // ASSERT (lst)
            var sel = lst.getSelection();
            var pkgs = [];

            for (var i = 0; i < sel.length; i ++) {
                var pkg = sel[i];
                pkgs.push (pkg.getAttribute ("name"));
            }

            this.opkgSrv.install (pkgs.join (' '), function (code, data, error) {
                // TODO: report success or failure
                //console.log ("install returned: " + code + "; msg: " + data + "; error: " + error);
                if (code == 0) {
		    	Console.pkglog(errArray["onInstallSuccess"]["color"],error,errArray["onInstallSuccess"]["name"]+", info:" +data);
                    	this.list ();
			btnPkgInstall1.disable();


                        sel[0].setAttribute("curver","installed");
			
                        lstPkg2.reload();


			//btnPkgUninstall.enable ();				
                }
		else{
			
			util.alert("onInstall", error, data);
			Console.pkglog(errArray["onInstallFailure"]["color"],error,errArray["onInstallFailure"]["name"]+", info:"+data);
			btnPkgInstall1.enable();
                        //btnPkgUninstall.disable(); 
		
		}
            });
        },


        onUninstall: function (lst) {
            // ASSERT (lst)

            var sel = lst.getSelection();
            var pkgs = [];

            for (var i = 0; i < sel.length; i ++) {
                var pkg = sel[i];
                pkgs.push (pkg.getAttribute ("name"));
            }

/*            if (sel.length == 0) {
                return;
            }
            var pkgs = sel[0].getAttribute ("name");*/

            this.opkgSrv.remove (pkgs.join (' '), function (code, data, error) {
                // TODO: report success or failure
                console.log ("uninstall returned: " + code + "; msg: " + data + "; error: " + error);


                if (code == 0) {
                    	Console.pkglog(errArray["onUninstallSuccess"]["color"],error,errArray["onUninstallSuccess"]["name"]+", info:"+data);
                    	this.list ();
			btnPkgInstall1.enable();
			lstPkg1.remove(sel[0]);

                        lstPkg1.reload();

			var list =lstPkg2.getTraverseNodes();
                        for(var k=0;k<list.length;k++){
				if(sel[0].getAttribute("name")===list[k].getAttribute("name")){
                                                                  
					list[k].setAttribute("curver","");
                                        break;
                              	}

			}
			
			 lstPkg2.reload();		
                }
		else{
			//errArray["onUninstallFaiure"]["name"] = data;
			util.alert("onUninstall", error, data);
			Console.pkglog(errArray["onUninstallFaiure"]["color"],error,errArray["onUninstallFaiure"]["name"]+", info:"+data);
			btnPkgInstall1.disable();
                        //btnPkgUninstall.enable(); 
		}
            });
        }
    });

});
