var WebSocket = require('ws');
var fs = require('fs');
var rl = require("readline").createInterface(process.stdin, process.stdout);
var net = require("net");

var websocket_client = function(){
	var th = this;
	
	var dir_home = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"];
	var setting_file_path = require("path").join(dir_home,".setting.json");
	
	/* ----- -----------------Websocket---------------- */
	var ws_url = "ws://ec2-52-68-77-61.ap-northeast-1.compute.amazonaws.com:3000";
	var ws_client = new WebSocket(ws_url);
	//接続時
	ws_client.on('open',function(){
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Connect 2 WebServer");
		choose_send(function(str){
			create_send_message(str,function(message){
				ws_client.send(message);
			});
		});
	});
	//メッセージ受け取り時
	ws_client.on('message',function(data){
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Message Recive : " + data);
		message_parse(data);
	});
	ws_client.on('error',function(error){
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Error : " + error.stack);
	});
	var send_to_webserver = function(str){
		return ws_client.send(str);
	};

	//--------------------------------------------------------------
	
	/* ------------------ TCP Server And Client ----------------*/
	// Client
	var tcp_client_port = 12000;
	var tcp_client = new net.Socket({readable:true,writable:true});

	tcp_client.on('error',function(error){
		tcp_client.connect({port:tcp_client_port});
	});	
	
	var send_to_mpserver = function(str){
		return tcp_client.write(str);
	};
	var connect_to_mpserver = function(){
		tcp_client.connect({port:tcp_client_port},function(){
			console.log("[WEBSERVER CLIENT] [TCP CLIENT] CONNECT TO MPSERVER");
		});
	};

	// Server
	var tcp_server_port = 10000;

	var tcp_server = new net.Server(function(socket){
		console.log("[WEBSERVER CLIENT] [TCP SERVER] CLIENT CONECTED");
		connect_to_mpserver();
		socket.on('error',function(){
			console.log("[WEBSERVER CLIENT] [TCP SERVER] SOCKET ERROR");
		});
		socket.on('data',function(str){
			send_to_webserver(str);
		});
	});
	
	tcp_server.on('error',function(){
		console.log("[WEBSERVER CLIENT] [TCP SERVER] SERVER ERROR");
	});
	var listen_tcp_server = function(){
		tcp_server.listen(tcp_server_port,function(){
			console.log("[WEBSERVER CLIENT] [TCP SERVER] SERVER LISTEN START]");
		});
	};

	//--------------------------------------------------------------
	
	//authかloginどちらを最初に送るか判定する
	var choose_send = function(callback){
		fs.exists(setting_file_path,function(exists){
			callback(exists ? "auth" : "login");
		});
	};

	//送るメッセージを作成する
	var create_send_message = function(str,callback){
		if(str == "auth"){
			fs.readFile(setting_file_path,function(err,data){
				obj = JSON.parse(data);
				json_obj = {"type":"auth","value":{"name":obj.name,"key":obj.raskey}};
				callback(JSON.stringify(json_obj));
			});
		}else if(str == "login"){
			var user_id,user_pass;
			rl.question("Your Account ID :",function(value){ 
				user_id = value;
				rl.question("Your PassWord :",function(value){
					user_pass = value;
					json_obj = {
						"type":"regist",
								"value":{
									"name":user_id,
									"password":user_pass
									}
						};
					text = JSON.stringify(json_obj);
					callback(text);
				});
			});
		}
	}

	//サーバー側から来たメッセージを解釈
	var message_parse = function(str){
		try{
			obj = JSON.parse(str);
			switch(obj["type"]){
				case "register":
					save_key(obj);
					break;
				case "login":
					check_login_result(obj);
					break;
				default:
				    send_to_mpserver(JSON.stringify(obj));
					break;
			}
		}catch(ex){
			console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Message Json Parse ERROR :" + ex.stack);
		}
	};

	//鍵の保存
	var save_key = function(obj){
		if(obj.value.result != -1){
		var save_str = JSON.stringify({"name":obj.value.user,"raskey":obj.value.key});
			fs.writeFile(setting_file_path,save_str,function(err){
				console.log(err);
			});
		}
	};
	
	//ログインチェック
	var check_login_result = function(obj){
		result = obj.value.result == 0 ? "LOGIN OK" : "LOGIN BAD";
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Login Result : " + result);
		// TODO ログインに失敗した時の処理
	};
	this.start = function(){
		listen_tcp_server();
	};
	
};


module.exports = websocket_client;

