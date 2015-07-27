var WebSocket = require('ws');
var fs = require('fs');
var rl = require("readline").createInterface(process.stdin, process.stdout);
var net = require("net");

/**
 * インスタンスを初期化します。
 * @constructor
 * @classdesc Webサーバーとの通信を管理するクラス
 */
var websocket_client = function(){
	var th = this;


	var dir_home = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"];
	/**
	 * 設定ファイルへのパス
	 */
	var setting_file_path = require("path").join(dir_home,".extension.json");

	/* ----- -----------------Websocket---------------- */

	/**
	 * WebsocketサーバーのURL
	 */
	var ws_url = "ws://ec2-52-68-77-61.ap-northeast-1.compute.amazonaws.com:3000";
	/**
	 * Webソケットクライアントのインスタンス
	 * @param {string} ws_url - WebSocketサーバーのURL
	 */
	var ws_client;
	//接続時
	var connect = function(){
		ws_url = "ws://ec2-52-68-77-61.ap-northeast-1.compute.amazonaws.com:3000";
		ws_client = new WebSocket(ws_url);
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
			message_parse(data);
		});
		ws_client.on('error',function(error){
			setTimeout(connect,2000);
		});
		ws_client.on('close',function(code,message){
			console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Connection to Websocket Server....");
			setTimeout(connect,2000);
		});
	};

	/**
	 * Websoketにメッセージを送信します
	 * @param {string} str - 送信する文字列
	 */
	var send_to_webserver = function(str){
		try{
			return ws_client.send(str);
		}catch(ex){
			console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Error " + ex.message);
		}
	};

	//--------------------------------------------------------------

	/* ------------------ TCP Server And Client ----------------*/
	// Client
	/**
	 * メッセージパーサーサーバーのポート番号
	 */
	var tcp_client_port = 12000;
	/**
	 * メッセージパーサーサーバーに接続するクライアント
	 */
	var tcp_client = new net.Socket({readable:true,writable:true});

	tcp_client.on('error',function(error){
		tcp_client.connect({port:tcp_client_port});
	});	

	/**
	 * メッセージサーバーにメッセージを送信するよ
	 * @param {string} str - 送信する文字列
	 */
	var send_to_mpserver = function(str){
		return tcp_client.write(str);
	};

	/**
	 * [tcp_client]{@link tcp_client}をメッセージパーサーサーバーに接続します
	 */
	var connect_to_mpserver = function(){
		tcp_client.connect({port:tcp_client_port});
	};

	// Server
	/**
	 * メッセージパーサー用TCPサーバーのインスタンス
	 */
	var tcp_server_port = 10000;

	var part_of_message = "";
	/**
	 * メッセージパーサからのクライアントを受け付けるサーバーのポート番号
	 */
	var tcp_server = new net.Server(function(socket){
		connect_to_mpserver();
		socket.on('error',function(){
			console.log("[WEBSERVER CLIENT] [TCP SERVER] SOCKET ERROR");
		});
		socket.on('data',function(str){
			var string = str.toString();
			if(string.slice(-1) == "}"){
				send_to_webserver(part_of_message + string);
				part_of_message = "";
			}else{
				part_of_message += string;	
			}
		});
	});


	tcp_server.on('error',function(){
		console.log("[WEBSERVER CLIENT] [TCP SERVER] SERVER ERROR");
	});

	/**
	 * [tcp_server]{@link tcp_server}をオープンします
	 */
	var listen_tcp_server = function(){
		tcp_server.listen(tcp_server_port);
	};

	//--------------------------------------------------------------

	//authかloginどちらを最初に送るか判定する
	/**
	 * authかloginかどちらを最初に送るかを判定します
	 * @param {callback} callback - 設定ファイルがあれば"auth"を、なければ"login"を因数に取るcallbac	 
	 */
	var choose_send = function(callback){
		fs.exists(setting_file_path,function(exists){
			callback(exists ? "auth" : "login");
		});
	};

	/**
	 * 子機に送信するメッセージを作成します
	 * @param {string} str - "auth"か"login"か
	 * @param {callback} callback - 作られた文字列を引数に取るcallback
	 */ 
	var create_send_message = function(str,callback){
		if(str == "auth"){
			fs.readFile(setting_file_path,function(err,data){
				var str = new Buffer(data.toString(),'base64').toString('utf8');
				obj = JSON.parse(str);
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
	/**
	 * サーバー側から来たメッセージを解釈します
	 * @param {string} str - Webサーバーから送られてきた文字列
	 */
	var message_parse = function(str){
		try{
			obj = JSON.parse(str);
			switch(obj["type"]){
				case "regist":
					save_key(obj);
					break;
				case "auth":
					check_login_result(obj);
					break;
				case "notice":
					check_function_register_result(obj);
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
	/** 
	 * ログイン時に届いたWebサーバーからのキーを保存します
	 * @param {object} obj  - 届いたjsonオブジェクト
	 */
	var save_key = function(obj){
		console.log(JSON.stringify(obj));
		if(obj.value.result == 0){
			var save_str = JSON.stringify({"name":obj.value.user,"raskey":obj.value.key});
			buf = new Buffer(save_str);
			save_str = buf.toString('base64');
			fs.writeFile(setting_file_path,save_str,function(err){
				if(err != null) console.log(err);
			});
		}
	};

	//ログインチェック
	/**
	 * ログインが成功したかどうか判定します
	 * @param {object} obj - Webサーバーから届いたjsonオブジェクト
	 */
	var check_login_result = function(obj){
		result = obj.value.result == 0 ? "LOGIN OK" : "LOGIN BAD";
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Login Result : " + result);
		if(obj.value.result != 0){
			fs.unlinkSync(setting_file_path);
			process.exit(1);
		}
		// TODO ログインに失敗した時の処理
	};
	
	/**
	 * 子機の関数登録が成功したかを確認します
	 * @param {object} obj - webサーバーから届いたjsonオブジェクト
	 */
	var check_function_register_result = function(obj){
		result = obj.value.result == 0 ? "FUNCTION REGSITER IS SUCCESS" : "FUNCTION REGSITER FAIL";
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] " + result);
	};

	/**
	 * TCPサーバーをスタートします
	 */
	this.start = function(){
		listen_tcp_server();
		console.log("[WEBSERVER CLIENT] [WEBSOCKET CLIENT] Connection to Websocket Server....");
		connect();
	};

};


module.exports = websocket_client;

