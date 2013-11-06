/**
 * project code Module
 * @author DengJianYong
 */

define(function(require, exports, module) {

	var ide = require("core/ide");
	var ext = require("core/ext");
	var util = require("core/util");
	var commands = require("ext/commands/commands");
	var editors = require("ext/editors/editors");
//	var Console = require ("ext/console/console");
//	var GitEngine = require("ext/project/gitengine");
//	var console = require ("ext/console/console");




	
	require("ext/main/main"); //Make sure apf is inited.
	
	module.exports = ext.register("ext/project/project", {
		dev         : "Sinobot",
		name        : "Project",
		alone       : true,
		type        : ext.GENERAL,
		deps        : [],
		offline     : false,
		autodisable     : ext.ONLINE | ext.LOCAL,
		worker      : null,
	
		currentSettings : [],
		nodes       : [],
//		gitEngine : new GitEngine(),	


		ignoreFiles: [".", ".DS_Store"],
		
		model: new apf.model(),


		
	
		init : function(){
			
			 if (ide.readonly)
               			 return;
			var _self = this;
//			_self.gitEngine.init (ide);
			
			apf.importCssString(_self.css);
			this.model = new apf.model();


        	this.model.load("<data><folder type='project' name='" + ide.projectName +
            "' path='" + ide.davPrefix + "' root='1'/></data>");

        	this.model.setAttribute("whitespace", false);
			var dav_url = location.href.replace(location.pathname + location.hash, "") + ide.davPrefix;
			this.webdav = apf.document.documentElement.appendChild(new apf.webdav({
				id  : "davProject",
				url : dav_url,
				onauthfailure: function() {
					ide.dispatchEvent("authrequired");
				}
        	}));

		},
		
		exists : function(path, callback) {
			if (this.webdav)
            	this.webdav.exists(path, callback);


    	},

		
		
		
		createProject: function(name, tree, noRename,callback) {
			if (!tree) {
				tree = apf.document.activeElement;
				if (!tree || tree.localName != "tree")
					tree = trFiles;
			}
			
			pjWizardDialog.hide();
	
			var node = tree.selected;
			//if (!node && tree.xmlRoot)
			node = tree.xmlRoot.selectSingleNode("folder");
			
			if (!node)
				return callback && callback();
	
			//if (node.getAttribute("type") != "folder" && node.tagName != "folder")
				//node = node.parentNode;
	
			if (this.webdav) {
				var prefix = name ? name : "New Project";
				var path = node.getAttribute("path");
				if (!path) {
					path = ide.davPrefix;
					node.setAttribute("path", path);
				}
				node.setAttribute("type", "project");
				var _self = this,
					index = 0;
	
				function test(exists) {
					
					if (exists) {
						name = prefix + "." + index++;
						_self.exists(path + "/" + name, test);
						
					}
					else {
						tree.focus();
						_self.webdav.exec("mkdir", [path, name], function(data) {
							// @todo: in case of error, show nice alert dialog
							if (!data || data instanceof Error) {
								callback && callback();
								throw Error;
							}
							// parse xml
							var nodesInDirXml = apf.getXml(data);
							// we expect the new created file in the directory listing
							var fullFolderPath = path + "/" + name;
							var folder = nodesInDirXml
								.selectSingleNode("//folder[@path=" + util.escapeXpathString(fullFolderPath) + "]");
	
							// not found? display an error
							if (!folder) {
								util.alert("Error", "Folder '" + name + "' could not be created",
									 "An error occurred while creating a new folder, please try again.");
								callback && callback();
								return;
							}
							// add project attr into folder
							// rannk
							folder.setAttribute("attr","project");
							_self.webdav.exec("create", [fullFolderPath, ".project"], function(data) {
							
								if (!data || data instanceof Error) {
										// @todo: should we display the error message in the Error object too?
										return util.alert("Error", "Project File '" + filename + "' could not be created",
											"An error occurred while creating a new Project, please try again.");
								}
								
								var init_content = "<project name=\"" + name + "\" type=\""+newProjectType.selected.getAttribute("value")+"\"></project>";
								
								_self.webdav.write(fullFolderPath + "/.project", init_content, null, function(data, state, extra) {
									if ((state == apf.ERROR && extra.status == 400 && extra.retries < 3) || state == apf.TIMEOUT)
										return extra.tpModule.retry(extra.id);
						
								});


								
							});
							
							tree.slideOpen(null, node, true, function(data, flag, extra){
								// empty data means it didn't trigger <insert> binding,
								// therefore the node was expanded already
								if (!data)
									tree.add(folder, node);
	
								folder = apf.queryNode(node, "folder[@path="+ util.escapeXpathString(fullFolderPath) +"]");
	
								tree.select(folder);
	
								if (!noRename)
									tree.startRename();
	
								ide.dispatchEvent("newfolder", {
									folderName: name,
									parentPath: path,
									path: fullFolderPath
								});
								callback && callback(folder);
							});
							
						});

						
					}
					
				}
	
				name = prefix;
				this.exists(path + "/" + name, test);

			}
    	},
		
		savePjConfig : function (){},
	});
});
