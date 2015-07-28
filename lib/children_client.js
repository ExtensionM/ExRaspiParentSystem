var fs = require('fs');
var ursa = require('ursa');
var dgram = require('dgram');
var tls = require('tls');
var net = require('net');
var mongoose = require('mongoose');

var CustomError = require("./src/custom_error.js");
var child_connection = require("./src/child_connection.js");

mongoose.connect("mongodb://localhost/raspi");

json_scheme = {
	name : String,
	id : String
};

var raschi_data = mongoose.model("raschi_data", new mongoose.Schema(json_scheme) );

/**
 * 公開鍵と秘密鍵と証明書ファイルへのパスを指定します。
 * <ul>
 * 	<li>{@link children_client~create_tlsclient}
 * 	<li>{@link children_client~register_client_with_mongodb}
 * 	<li>{@link children_client~register_to_db}
 * 	<li>{@link children_client~start_udp_server}
 * 	<li>{@link children_client~send_to_mpserver}
 * 	<li>{@link children_client~connect_to_mpserver}
 * 	<li>{@link children_client~listen_tcp_server}
 * 	<li>{@link children_client~connect_to_children}
 * 	<li>{@link children_client~send_command_to_children}
 * 	<li>{@link children_client.message_parse}
 * 	<li>{@link children_client.start}
 * </ul>
 * @constructor
 * @classdesc 子機との通信を管理するクラス
 * @param {string} public_key_path - 公開鍵へのパス
 * @param {string} private_key_path - 秘密鍵へのパス
 * @param {string} crt_file_path - 証明書へのパス
 */
var children_client = function(public_key_path,private_key_path,crt_file_path){
	var th = this;

	/* -------------------------- SSL Module ----------------------*/
	//ssl module class

	/**
	 * 秘密鍵と公開鍵へのパスを指定します。
	 * <ul>
	 * 	<li> {@link ssl_module.decrypt}
	 * 	<li> {@link ssl_module.encrypt}
	 * </ul>
	 * @constructor
	 * @classdesc UDPの通信の際に送られてきたデータを復号化するクラスです。
	 * @param {string} pubpath - 公開鍵へのパス
	 * @param {string} pripath - 秘密鍵へのパス
	 */
	var ssl_module = function(pubpath,pripath){
		/**
		 * 復号化に利用する秘密鍵オブジェクト
		 */ 
		var key = ursa.createPrivateKey(fs.readFileSync(pripath));

		/**
		 * 暗号化に利用する公開鍵オブジェクト
		 */
		var crt = ursa.createPublicKey(fs.readFileSync(pubpath));

		/**
		 * メッセージを復号化する
		 * @param {string} msg - 復号化する文字列
		 * @return {string} 復号化した文字列
		 */
		this.decrypt = function(msg){
			return key.decrypt(msg,'base64','utf8');
		};

		/**
		 * メッセージを暗号化する
		 * @param {string} msg - 暗号化する文字列
		 * @return {string} 暗号化した文字列
		 */
		this.encrypt = function(msg){
			return crt.encrypt(msg,'utf8','base64');
		};
	};

	/**
	 * {@link ssl_module} のインスタンス
	 * @type {ssl_module}
	 */
	var sslm = new ssl_module(public_key_path,private_key_path);

	//---------------------------------------------------------------

	/*-------------------------- TLS CLient -----------------------*/
	//tls_client class
	//
	/**
	 * 子機に接続しているソケットとその子機のguidを指定します。
	 * <li>
	 * 	<ul>{@link tls_client.write}
	 * </li>
	 * @constructor
	 * @classdesc 子機との通信をするTLSのクライアントのクラス
	 * @param {tls.TLSSocket} socket - [tls.TLSSocket]{@link http://u111u.info/mnHq} のインスタンス
	 * @param {string} guid - 接続している子機のguid
	 */
	var tls_client = function(socket,guid){
		/**
		 * tlsのソケット
		 */
		this.socket = socket;
		/**
		 * 接続状態の確認
		 */

		var connection = true;
		/**
		 * 子機のGUID
		 * @type {string}
		 */
		this.guid = guid;
		/**
		 * メッセージを送信します
		 * @param {string} str - 送信する文字列
		 */	
		this.write = function(str){
			if(connection){
				try{
					this.socket.write(str,'utf-8');
				}catch(ex){
					console.log("[CHILDREN CLIENT] [TLS CLIENT] Message Write Error: " + ex.stack);
				}
			}
			return connection;
		};

		/**
		 * ソケットでエラーが発生した場合の関数 
		 * @method
		 * @listens error  
		 */
		this.socket.on("error",function(ex){
			//
		});

		/**
		 * ソケットがオープンした時
		 */
		var socket_this = this;
		this.socket.on("connect",function(ex){
			console.log("Open Connection to " + socket_this.guid);
			var child_info = new child_connection(socket_this.guid,true).toString();
			th.message_parse(child_info);
		});	

		/**
		 * ソケットがクローズした場合
		 */
		this.socket.on("close",function(ex){
			console.log("Close Connection to " + socket_this.guid);
			connection = false;
			var child_info = new child_connection(socket_this.guid,false).toString();
			th.message_parse(child_info);
		});

		/**
		 * ソケットからデータが来た場合の関数
		 */
		this.socket.on('data',function(str){
			th.message_parse(str);
		});
	};

	/**
	 * tls_clientの設定
	 */
	var option = { 
		ca: fs.readFileSync(crt_file_path),
		rejectUnauthorized:false
	};

	/**
	 * {@link tls_client}のインスタンス
	 */
	var tls_clients = {};
	/**
	 * 子機と接続するtls_clientを作成します
	 *
	 * @param {string} guid - 子機のguid
	 * @param {dgram.rinfo} rinfo - 子機のアドレス情報 {@link http://u111u.info/momf}
	 * @param {num} port - ポート番号
	 */
	var create_tlsclient = function(guid,port,rinfo){
		var socket = tls.connect(port,rinfo.address,option);
		//TODO 
		//子機に命令を送るときにtls_clientsのguidから判別するのではなくいい感じにtls_client.guidから判別したい
		tls_clients[guid] = new tls_client(socket,guid);
	};
	//-------------------------------------------------------------------

	/*------------------------- Mongoose -------------------------------*/


	/**
	 * 子機情報をmongodbに保存
	 * @param {Object} obj - 子機情r報のjson
	 */
	var register_client_with_mongodb = function(obj){
		var item = new raschi_data(
				{name:obj["name"],id:obj["guid"]}
				);
		item.save(function(e){console.log("add:"+JSON.stringify(item));});
	};

	/**
	 * 子機情報をデータベースに保存するかどうかを判定する
	 * @param {Object} obj - 子機情報のjson
	 */
	var register_to_db = function(obj){
		raschi_data.find({},function(err,docs){
			var id = -1;
			for(var i=0,size =docs.length;i < size; ++i){
				if(docs[i].id == obj["guid"]) id = docs[i].id;
			}
			if(id == -1){
				register_client_with_mongodb(obj);
			}
		});
	};

	/**
	 * guidから子機の名前を取り出します
	 * @param {string} guid - 子機のid
	 */
	var search_name_from_db = function(guid,callback){
		raschi_data.find({},function(err,docs){
			var name = "";
			for(var i=0, size=docs.length; i<size; ++i) {
				if(docs[i].id == guid) name = docs[i].name;
			}
			callback(name);
		});
	};

	//--------------------------------------------------------------------

	/* ------------------------- UDP Server -----------------------------*/ 

	/**
	 * udpのサーバーのポート番号 
	 * @type {num}
	 */
	var udp_server_port = 8000;
	/**
	 * udpのサーバーのインスタンス
	 */
	var udp_server = dgram.createSocket("udp4");

	/**
	 * udp_serverでエラーが起きた際のプログラム
	 */
	udp_server.on("error",function(err){
		console.log("[CHILDREN CLIENT] [UDP SERVER] Server error: " + err.stack);
	});

	/**
	 * updサーバーでメッセージを受け取った時のプログラム
	 */
	udp_server.on("message",function(msg,rinfo){
		connect_to_children(msg,rinfo);
	});


	/**
	 * UDPサーバーをスタートさせます
	 */
	var start_udp_server = function(){
		try{
			udp_server.bind(8000,"0.0.0.0");
			console.log("Open UDP Server");
		}catch(ex){
		}
	};

	//--------------------------------------------------------------------	

	/* ------------------ TCP Server And Client ----------------*/
	// Client

	/**
	 * メッセージサーバーのポート番号
	 * @type {num}
	 */
	var tcp_client_port = 12000;
	/**
	 * メッセージパーサーサーバーに接続するクライアント
	 */
	var tcp_client = new net.Socket({readable:true,writable:true});

	/**
	 * メッセージパーサーに接続するのが失敗した時
	 */
	tcp_client.on('error',function(error){
		tcp_client.connect({port:th.tcp_client_port});
	});	

	/**
	 * メッセージサーバーにメッセージを送信するプログラム
	 *
	 * @param {string} str - 送信する文字列
	 */
	var send_to_mpserver = function(str){
		return tcp_client.write(str);
	};

	/**
	 * メッセージパーサーサーバーに接続します
	 */
	var connect_to_mpserver = function(){
		tcp_client.connect({port:tcp_client_port});
	};

	// Server

	/**
	 * メッセージパーサからのクライアントを受け付けるサーバーのポート番号
	 * @type {num}
	 */
	var tcp_server_port = 20000;


	/**
	 * メッセージパーサー用TCPサーバーのインスタンス
	 */
	var tcp_server = new net.Server(function(socket){
		connect_to_mpserver();
		socket.on('error',function(){
			console.log("[CHILDREN CLIENT] [TCP SERVER] SOCKET ERROR");
		});
		socket.on('data',function(str){
			obj = JSON.parse(str);
			if(obj.type == "system_command"){
				run_system_command(str);
			}else{
				send_command_to_children(str);
			}
		});
	});

	/**
	 * メッセージサーバー用サーバーがエラーを起こした時
	 */
	tcp_server.on('error',function(){
		console.log("[CHILDREN CLIENT] [TCP SERVER] SERVER ERROR");
	});
	/**
	 * メッセージサーバー用TCPサーバーの待機を始める
	 */
	var listen_tcp_server = function(){
		tcp_server.listen(tcp_server_port);
	};

	/**
	 * system_commandを実行します
	 * @param {string} str - system_command json class
	 */
	var run_system_command = function(str){
		obj = JSON.parse(str);
		switch(obj.value.message){
			case 'start_udp':
				start_udp_server();
				break;
		}
	};

	//-------------------------------------------------------------

	/**
	 * UDPサーバーで受け取ったデータを元に子機に接続する
	 *
	 * @param {string} str - UDPで受信したメッセージ
	 * @param {dgram.rinfo} client_info - 子機のアドレス情報 {@link http://u111u.info/momf}
	 */
	var connect_to_children = function(str,client_info){
		json_str = sslm.decrypt(str.toString('utf8',0,client_info.size));
		obj = JSON.parse(json_str);
		register_to_db(obj);
		create_tlsclient(obj.guid,obj.port,client_info);		
	};
	/**
	 * 子機に命令を送信する
	 *
	 * @param {string} str - 子機に送る命令の文字列
	 */
	var send_command_to_children = function(str){
		var json_obj = JSON.parse(str);
		var guid = json_obj.id;
		message = JSON.stringify(json_obj["message"]);
		try{
			tls_clients[guid].write(message);
		}catch(ex){
			search_name_from_db(guid,function(name){
				var error_obj = new CustomError("Connection Refused",400);
				var obj = {
					"type" : "result",
					"id" : guid,
					"name" : name,
					"value": {
						"functionName" : json_obj.message.value.functionName,
						"hasError" : true,
						"error":error_obj,
						"result" : undefined
					}
				};
				send_to_mpserver(JSON.stringify(obj));
			});
		}
	};

	/**
	 * メッセージをパースする
	 *
	 * @param {string} str - パースする文字列
	 */
	this.message_parse = function(str){
		send_to_mpserver(str);
	};

	/**
	 * UDPサーバーとTCPサーバーをスタートさせる
	 */
	this.start = function(){
		listen_tcp_server();
	};
};

module.exports = children_client;
