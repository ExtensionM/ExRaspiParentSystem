var WebSocket = require('ws');
var fs = require('fs');
var rl = require("readline").createInterface(process.stdin, process.stdout);
var net = require("net");

var websocket_client = function(){
	var th = this;
	
	var dir_home = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"];
	this.setting_file_path = require("path").join(dir_home,".setting.json");
	
	/* ----- -----------------Websocket---------------- */
	this.ws_url = "ws://ec2-52-68-77-61.ap-northeast-1.compute.amazonaws.com:3000";
	this.ws_client = new WebSocket(th.ws_url);
	//接続時
	this.ws_client.on('open',function(){
		console.log("[WebSocket Client] Connect 2 WebServer");
		type = th.choose_send();
		th.create_send_message(type,function(message){
			ws_client.send(message);
		});
	});
	//メッセージ受け取り時
	this.ws_client.on('message',function(data){
		console.log("[WebSocket Client] Message Recive : " + data);
		th.message_parse(data);
	});
	this.ws_client.on('error',function(error){
		console.log("[WebSocket Client] Error : " + error.stack);
	});
	this.send_to_webserver = function(str){
		return th.ws_client.send(str);
	});

	//--------------------------------------------------------------
	
	/* ------------------ TCP Server And Client ----------------*/
	// Client
	this.tcp_client_port = 12000;
	this.tcp_client = new net.socket({readable:true,writable:true});

	this.tcp_client.on('error',function(error){
		th.tcp_client.connect({port:th.tcp_client_port});
	});	
	
	this.send_to_mpserver = function(str){
		return th.tcp_client.write(str);
	};
	this.connect_to_mpserver = function(){
		th.tcp_client.connect({port:th.tcp_client_port});
	};

	// Server
	this.tcp_server_port = 10000;

	this.tcp_server = new net.Server(function(socket){
		socket.on('error',function(){
			console.log("[SERVER : TCP SERVER] SOCKET ERROR");
		});
		socket.on('data',function(str){
			th.send_to_webserver(str);
		});
	});
	
	this.tcp_server.on('error',function(){
		console.log("[SERVER : TCP SERVER] SERVER ERROR");
	});
	this.listen_tcp_server = function(){
		th.tcp_server.listen(th.tcp_server_port,function(){
			console.log("[SERVER : TCP SERVER] SERVER LISTEN START]");
		});
	};

	//--------------------------------------------------------------
	
	//authかloginどちらを最初に送るか判定する
	this.choose_send = function(){
		var exi_file = false;
		fs.exists(th.setting_file_path,function(exists){
			exi_file = exists;
		});
		return exi_file ? "auth" : "login";
	};

	//送るメッセージを作成する
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

	//サーバー側から来たメッセージを解釈
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
					th.send_to_mpserver(JSON.stringify(obj));
					break;
			}
		}catch(ex){
			console.log("[WebSocket Clinet] Message Json Parse ERROR :" + ex.stack);
		}
	};

	//鍵の保存
	this.save_key = function(obj){
		var save_str = JSON.stringify({"name":obj["user"],"raskey":obj["key"]});
		fs.writeFile(th.setting_file_path,save_str,function(err){
			console.log(err);
		});
	};
	
	//ログインチェック
	this.check_login_result = function(obj){
		console.log(obj["result"]);
		// TODO ログインに失敗した時の処理
	};
	
};

var wsc = websocket_client();
