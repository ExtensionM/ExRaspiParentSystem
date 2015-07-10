var fs = require('fs');
var ursa = require('ursa');
var dgram = require('dgram');
var tls = require('tls');
var net = require('net');
var mongoose = require('mongoose');

mongoose.connect("mongodb://localhost/raspi");

json_scheme = {
	name : String,
	id : String
};

var raschi_data = mongoose.model("raschi_data", new mongoose.Schema(json_scheme) );

var children_client = function(public_key_path,private_key_path,crt_file_path){
	var th = this;

	/* -------------------------- SSL Module ----------------------*/
	//ssl module class
	var ssl_module = function(pubpath,pripath){
		this.key = ursa.createPrivateKey(fs.readFileSync(pripath));
		this.crt = ursa.createPublicKey(fs.readFileSync(pubpath));

		this.decrypt = function(msg){
			return this.key.decrypt(msg,'base64','utf8');
		};

		this.encrypt = function(msg){
			return this.crt.encrypt(msg,'utf8','base64');
		};
	};

	var sslm = new ssl_module(public_key_path,private_key_path);

	//---------------------------------------------------------------

	/*-------------------------- TLS CLient -----------------------*/
	//tls_client class
	var tls_client = function(socket,guid){
		this.socket = socket;
		this.guid = guid;
		this.write = function(str){
			try{
				this.socket.write(str,'utf-8');
			}catch(ex){
				console.log("[TLS] Message Write Error: " + ex.stack);
			}
		};
		this.socket.on("error",function(ex){
			console.log("[RASPI CHILDREN] [TLS CLINET] ERROR: " + ex.stack);
		});
		this.socket.on('data',function(str){
			console.log("[RASPI CHILDREN] [TLS CLIENT] Message recived:" + str);
			th.message_parse(str);
		});
	};

	var option = { 
		ca: fs.readFileSync(crt_file_path),
		rejectUnauthorized:false
	};

	var tls_clients = {};
	var client_list = [];
	var create_tlsclient = function(guid,rinfo){
		if(client_list.indexOf(guid) == -1){
			var socket = tls.connect(15000,rinfo.address,option);
			//TODO 
			//子機に命令を送るときにtls_clientsのguidから判別するのではなくいい感じにtls_client.guidから判別したい
			tls_clients[guid] = new tls_client(socket,guid);
			client_list.push(guid);
		}else{
			delete client_list[client_list.indexOf(guid)];
			var socket = tls.connect(15000,rinfo.address,option);
			//TODO 
			//子機に命令を送るときにtls_clientsのguidから判別するのではなくいい感じにtls_client.guidから判別したい
			tls_clients[guid] = new tls_client(socket,guid);
			client_list.push(guid);
		}	
	};
	//-------------------------------------------------------------------

	/*------------------------- Mongoose -------------------------------*/


	var register_client_with_mongodb = function(obj){
		var item = new raschi_data(
				{name:obj["name"],id:obj["guid"]}
				);
		item.save(function(e){console.log("add:"+JSON.stringify(item));});
	};
	var register_to_db = function(obj){
		raschi_data.find({},function(err,docs){
			var id = -1;
			for(var i=0,size =docs.length;i < size; ++i){
				var children_id = docs[i].id;
				if(children_id == obj["guid"]) id == docs[i].id;
			}
			if(id == -1){
				register_client_with_mongodb(obj);
			}
		});
	};

	//--------------------------------------------------------------------

	/* ------------------------- UDP Server -----------------------------*/ 

	var udp_server_port = 8000;
	var udp_server = dgram.createSocket("udp4");

	udp_server.on("error",function(err){
		console.log("[UDP] Server error: " + err.stack);
	});

	udp_server.on("message",function(msg,rinfo){
		console.log("[UDP] message comming");
		connect_to_children(msg,rinfo);
	});

    var start_udp_server = function(){
		udp_server.bind(8000,"0.0.0.0");
		console.log("OPEN UDP SERVER");
	};

	//--------------------------------------------------------------------	

	/* ------------------ TCP Server And Client ----------------*/
	// Client
	var tcp_client_port = 12000;
	var tcp_client = new net.Socket({readable:true,writable:true});

	tcp_client.on('error',function(error){
		tcp_client.connect({port:th.tcp_client_port});
	});	
	
	var send_to_mpserver = function(str){
		return tcp_client.write(str);
	};

	var connect_to_mpserver = function(){
		tcp_client.connect({port:tcp_client_port},function(){
			console.log("CONNECT TO MPSERVER");
		});
	};

	// Server
	var tcp_server_port = 20000;

	var tcp_server = new net.Server(function(socket){
		console.log("CONNECT CLIENT");
		connect_to_mpserver();
		socket.on('error',function(){
			console.log("[CHILDREN CLIENT] [ TCP SERVER] SOCKET ERROR");
		});
		socket.on('data',function(str){
			send_command_to_children(str);
		});
	});
	
	tcp_server.on('error',function(){
		console.log("[CHILDREN CLIENT][ TCP SERVER] SERVER ERROR");
	});
	var listen_tcp_server = function(){
		tcp_server.listen(tcp_server_port,function(){
			console.log("[SERVER : TCP SERVER] SERVER LISTEN START]");
		});
	};

	//-------------------------------------------------------------

	var connect_to_children = function(str,client_info){
		json_str = sslm.decrypt(str.toString('utf8',0,client_info.size));
		obj = JSON.parse(json_str);
		register_to_db(obj);
		create_tlsclient(json_str["guid"],client_info);		
	};
	var send_command_to_children = function(str){
		json_obj = JSON.parse(str);
		message = JSON.stringify(json_obj["message"]);
		tls_clients[json_obj["guid"]].write(message);
	};

	this.message_parse = function(str){
		send_to_mpserver(str);
	};
	this.start = function(){
		start_udp_server();
		listen_tcp_server();
	};
};

module.exports = children_client;
