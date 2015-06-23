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

	this.ssl_module = new ssl_module(public_key_path,private_key_path);

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
			th.message_parse(str);
		});
	};

	this.option = { 
		ca: fs.readFileSync(crt_file_path),
		rejectUnauthorized:false
	};

	this.tls_clients = {};
	this.client_list = [];
	this.create_tlsclient = function(guid,rinfo){
		if(th.client_list.indexOf(guid) == -1){
			var socket = tls.connect(15000,rinfo.address,this.option);
			//TODO 
			//子機に命令を送るときにtls_clientsのguidから判別するのではなくいい感じにtls_client.guidから判別したい
			th.tls_clients[guid] = new tls_client(socket,guid);
			th.client_list.push(guid);
		}
	};
	//-------------------------------------------------------------------

	/*------------------------- Mongoose -------------------------------*/

	this.client_list = [];

	this.register_client_with_mongodb = function(str){
		var json_obj = JSON.parse(str);
		var item = new raschi_data(
				{name:json_obj["name"],id:json_obj["guid"]}
				);
		item.save(function(e){console.log("add:"+JSON.stringify(item));});
	};
	this.register_to_db = function(str){
		raschi_data.find({},function(err,docs){
			var id = -1;
			for(var i=0,size =docs.length;i < size; ++i){
				var children_id = docs[i].id;
				if(children_id == str["guid"]) id == docs[i].id;
			}
			if(id == -1){
				th.register_client_with_mongodb(str);
			}
		});
	};

	//--------------------------------------------------------------------

	/* ------------------------- UDP Server -----------------------------*/ 

	this.udp_server_port = 8000;
	this.udp_server = dgram.createSocket("udp4");

	this.udp_server.on("error",function(err){
		console.log("[UDP] Server error: " + err.stack);
	});

	this.udp_server.on("message",function(msg,rinfo){
		console.log("[UDP] message comming");
		th.connect_to_children(msg,rinfo);
	});
	this.start_udp_server = function(){
		th.udp_server.bind(8000,"0.0.0.0");
		console.log("OPEN UDP SERVER");
	};

	//--------------------------------------------------------------------	

	this.connect_to_children = function(str,client_info){
		json_str = th.ssl_module.decrypt(str.toString('utf8',0,client_info.size));
		obj = JSON.parse(json_str);
		th.register_to_db(json_str);
		th.create_tlsclient(json_str["guid"],client_info);		
	};

	this.message_parse = function(str){
	};
};

cclient = new children_client("../certs/public_key.pem", "../certs/private_key.pem", "../certs/server.crt");
cclient.start_udp_server();
