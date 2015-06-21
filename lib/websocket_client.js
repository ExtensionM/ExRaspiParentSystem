var WebSocket = require('ws');
var fs = require('fs');
var rl = require("readline").createInterface(process.stdin, process.stdout);

var websocket_client = function(){
	var th = this;
	var dir_home = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"];

	this.setting_file_path = require("path").join(dir_home,".setting.json");
	this.ws_url = "ws://ec2-52-68-77-61.ap-northeast-1.compute.amazonaws.com:3000";
	this.ws_client = new WebSocket(th.ws_url);

	this.choose_send = function(){
		var exi_file = false;
		fs.exists(th.setting_file_path,function(exists){
			exi_file = exists;
		});
		return exi_file ? "auth" : "login";
	};

	this.create_send_message = function(str,callback){
		if(str == "auth"){
			fs.readFile(th.setting_file_path,function(data){
				obj = JSON.parse(data);
				obj[type] = str;
				callback(JSON.stringify(obj));
			});
		}else if(str == "login"){
			var user_id,user_pass;
			rl.question("Your Account ID :",function(value){ 
				user_id = value;
				rl.question("Your PassWord :",function(value){
					user_pass = value;
					json_obj = {"type":"regist","name":user_id,"password":user_pass};
					text = JSON.stringify(json_obj);
					callback(text);
				});
			});
		}
	}

	this.message_parse = function(str){
		try{
			obj = JSON.parse(str);
			switch(obj["type"]){
				case "register":
					th.save_key(obj);
					break;
				case "login":
					th.check_login_result(obj);
					break;
				default:
					break;
			}
		}catch(ex){
			console.log("[WebSocket Clinet] Message Json Parse ERROR :" + ex.stack);
		}
	};

	this.save_key = function(obj){
		var save_str = JSON.stringify({"name":obj["user"],"raskey":obj["key"]});
		fs.writeFile(th.setting_file_path,save_str,function(err){
			console.log(err);
		});
	};
	
	this.check_login_result = function(obj){
		console.log(obj["result"]);
		// TODO ログインに失敗した時の処理
	};
	
	this.ws_client.on('open',function(){
		console.log("[WebSocket Client] Connect 2 WebServer");
		type = th.choose_send();
		th.create_send_message(type,function(message){
			ws_client.send(message);
		});
	});
	this.ws_client.on('message',function(data){
		console.log("[WebSocket Client] Message Recive : " + data);
		th.message_parse(data);
	});

};

var wsc = websocket_client();
