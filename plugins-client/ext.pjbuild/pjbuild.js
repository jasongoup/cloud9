/**
 * project code building Module
 * @author DengJianYong
 */

define(function(require, exports, module) {

	var ide = require("core/ide");
	var ext = require("core/ext");
	var util = require("core/util");
	var skin = require("text!ext/pjbuild/skin.xml");
	var markup = require("text!ext/pjbuild/pjbuild.xml");
	var fs   = require("ext/filesystem/filesystem");
	var menus = require("ext/menus/menus");
	var settings = require("ext/settings/settings");
	var css = require("text!ext/pjbuild/pjbuild.css");
	var pjBuildObj = require("ext/pjbuild/build-op");
	var Console = require ("ext/console/console");
	
	module.exports = ext.register("ext/pjbuild/pjbuild", {
		dev         : "Sinobot",
		name        : "Project Build",
		alone       : true,
		skin    : {
			id  : "pjbuild",
			data : skin,
			"media-path" : ide.staticPrefix + "/ext/pjbuild/style/images/"
		},
		type        : ext.GENERAL,
		css         : util.replaceStaticPrefix(css),
		markup      : markup,
		deps        : [],
		offline     : false,
		autodisable     : ext.ONLINE | ext.LOCAL,
		worker      : null,
	
		currentSettings : [],
		nodes       : [],
	
		ignoreFiles: [".", ".DS_Store"],
		
		pjBuildObj : new pjBuildObj (),
		model: new apf.model(),
	
		hook : function(){
			var _self = this;
			ide.addEventListener("init.ext/tree/tree", function(){
				mnuCtxTree.addEventListener("afterrender", function(){
					_self.nodes.push(
						mnuCtxTree.insertBefore(new apf.item({
							id : "mnuCtxTreePjbuild",
							match : "[folder]",
							visible : "{trFiles.selected.getAttribute('type')=='folder'}",
							caption : "Build Configuration",
							onclick : function(){
								//ext.initExtension(_self);
								pjbuildDialog.show();
							}
						}), itemCtxTreeNewFile),
						mnuCtxTree.insertBefore(new apf.divider({
							visible : "{mnuCtxTreePjbuild.visible}"
						}), itemCtxTreeNewFile)
						
					);			
				});
			});
			
			_self.nodes.push(

				menus.addItemByPath("Project/~", new apf.divider(), 300000),
				menus.addItemByPath("Project/Build Configuration", new apf.item({
						onclick : function(){								
							//ext.initExtension(_self);
							pjbuildDialog.show();
						}
				}), 300001)
				//menus.addItemByPath("Project/Build Files/", new apf.menu(), 300002)
			);
			
			this.model = new apf.model().load("<pjbuild/>");
			ide.addEventListener("settings.load", function (e) {
					// TODO: setup default
					settings.setDefaults("pjbuild", [
						["autohide", "true"]
					]);
					var rootnode = e.model.queryNode("//settings/pjbuild");
	
					_self.model.load(rootnode);
					
					var pjbuildNode = _self.model.queryNode("./pjbuildtitle[@name='build file']");

					if(pjbuildNode == null){
						var vv1 = apf.n("<pjbuildtitle />");
						vv1.attr("name","build file");
						//var path = "pjbuild";
						_self.model.appendXml(vv1.xml());
					}
			});
						
			ext.initExtension(_self);
		},
	
		init : function(){
			var _self = this;
			_self.pjBuildObj.init (ide);
			apf.importCssString(_self.css);
			//this.pjBuildObj.build();
			
	
			btnPjbuildB.addEventListener("click",function(e){
				var sObj = pjBuildTree.selected;
				//var mmode = _self.model.queryNode("./pjbuildtitle[@name='build file']/pjbuildfile[@a_id='1|4']");
				
				_self.pjBuildObj.build(sObj.getAttribute("key_var"));
				pjbuildDialog.hide();
			});
			
			_self.initMenuItem();

		},
		
		addPjBuildFile : function(){
			var vv1 = apf.n("<pjbuildfile />");
			vv1.attr("key_var" , Math.random() + "-" + Date.parse(new Date()));
			vv1.attr("name","test1");
			vv1.attr("shell","");
			vv1.attr("argv","");
			var path = "./pjbuildtitle[@name='build file']";
			this.model.appendXml(vv1.node(),path);
		},
		
		removePjBuildFile : function(){
			var sObj = pjBuildTree.selected;
			pjBuildTree.remove(sObj);
		},
		
		addMenuItem : function (name,key,i){
			var _self = this;
			menus.addItemByPath("Project/Build Files/" + name, new apf.item({
						onclick : function(){								
							_self.pjBuildObj.build(key);
						}
			}), 310000+i);
		},
		
		initMenuItem : function(){
			var _self = this;
			menus.remove("Project/Build Files/");
			menus.addItemByPath("Project/Build Files/", new apf.menu(), 300002);
			
			var buildFsObj = _self.model.queryNodes("./pjbuildtitle[@name='build file']/pjbuildfile");
			for(var i=0;i<buildFsObj.length;i++){
				var key_var = buildFsObj[i].getAttribute("key_var");
				_self.addMenuItem(buildFsObj[i].getAttribute("name"),key_var,i);
				
			}		
		}
	});
});
