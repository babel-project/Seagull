// import modules.
var http = require('http');
var path = require('path');
var fs = require('fs');
var url = require('url');
var mysql = require('mysql');
var clientHtml = fs.readFileSync('index.html');
var WSServer = require('websocket').server;

// document root.
var documentRoot = '/usr/local/node/chart';

// connection pool.
var pool = mysql.createPool({
	host : 'localhost',
	user : 'mysql',
	password : 'mysql',
	database : 'chart',	
	insecureAuth : true,
});

// MIME types.
var mimeTypes = {
	'.js' : 'text/javascript',
	'.html' : 'text/html',
	'.css' : 'text/css',
};

// default http servser.
var plainHttpServer = http.createServer(function (request, response) {
	/*
	console.log(request.headers);
	for (var k in request.headers) {
		fs.open('./request.txt', 'a', 666, function( e, id ) {
			fs.appendFile("./request.txt", k + " == " + request.headers[k], function(err) {
				if(err) {
					console.log(err);
				} else {
					console.log("The file was saved!");
				}
			}); 
		});
	}
	*/
	var methodType = request.method;
	if (methodType == 'GET') {
		doGet(request, response);
	} else if (methodType == 'POST') {
		doPost(request, response);
	}
}).listen(8880);

// get request method names.
var getMethods = {
	'/select/header?' : initSelect,
}

// GET
function doGet(request, response) {
	var headers;
	var requrl = decodeURI(request.url);
	// default URL.
	if (requrl === '/') {
		headers = {'Content-Type' : 'text/html'};
		response.writeHead(200, headers);
		response.end(clientHtml);
	// ignore favicon icon.
	} else if (requrl === '/favicon.ico') {
		return;
	// request method
	} else if (callMethod = getMethods[requrl]) {
		callMethod(response);
	// For example, script files, etc.
	} else {
		var filename = documentRoot + requrl;
		var data = fs.readFileSync(filename);
		headers = {'Content-Type' : mimeTypes[path.extname(filename)]};
		response.writeHead(200, headers);
		response.end(data);
	}
}

// post request method names.
var postMethods = {
	'/create/header' : createHeader,
	'/login' : login,
	'/create/account' : createAccount,
	'/delete/question' : delteQuestion,
}

// POST
function doPost(request, response) {
	var requrl = decodeURI(request.url);
	if (callMethod = postMethods[requrl]) {
		callMethod(request, response);
	}
}

// when application loaded. this method called.
var initSelectQuery = "select * from header";
function initSelect(response) {
	pool.getConnection(function(err, connection) {
		connection.query(initSelectQuery, function(err, rows) {
			if (err) {
				connection.end();
				throw err;
			}
			connection.end();
			rows = JSON.stringify(rows);
			var headers = {'Content-Type' : 'application/json'};
			response.writeHead(200, headers);
			response.end(rows);
		});
	});
}

// create questions.
function createHeader(request, response) {
	var param;
	request.on('data', function(chunk) {
		param = JSON.parse(chunk);
	}).on('end', function() {
		pool.getConnection(function(err, connection) {
			var paramTxt = connection.escape(param["text"]);
			var paramSeq = connection.escape(param["user_sequence"]);
			var insertQuery = "insert into header (text, user_sequence) values("
				+ paramTxt
				+ ","
				+ paramSeq
				+ ")";
			connection.query(insertQuery, function(err, rows) {
				if (err) {
					connection.end();
					throw err;
				}
				connection.end();
				var res = {
					text : param["text"],
					header_key : rows["insertId"],
					user_sequence : param["user_sequence"],
				};
				var headers = {'Content-Type' : 'application/json'};
				response.writeHead(200, headers);
				response.end(JSON.stringify(res));
			});
		});
	});
}

// websocket.
var webSocketServer = new WSServer({ httpServer : plainHttpServer });
var requestType = {
	"contents" : selectContents,
	"vote" : voteContents,
	"answer" : createContents,
	"create_answer_manager" : createAnswerManager,
};
// hold connections.
var connections = [];
webSocketServer.on('request', function (req) {
	req.origin = req.origin || '*';
	var websocket = req.accept(null, req.origin);
	connections.push(websocket);
	websocket.on('message', function (msg) {
		var param = JSON.parse(msg.utf8Data);
		for (var k in requestType) {
			if (param[k]) { 
				requestType[k](websocket, param[k]);
			}
		}
	});
	
	websocket.on('close', function(code, desc) {
		console.log('接続解除 : ' + code + ' - ' + desc);
	});
});

// get the answer to the questions.
function selectContents(websocket, arg) {
	var select = "select * from contents where header_key = " + arg;
	pool.getConnection(function(err, connection) {
		connection.query(select, function(err, rows) {
			if (err) {
				connection.end();
				throw err;
			}
			if (rows.length > 0) {
				rows = JSON.stringify(rows);
			} else {
				rows = JSON.stringify([{ message : "回答無し" , header_key : arg }]);
			}
			connection.end();
			for (var i = 0 ; i < connections.length; i++){
				if(!connections[i].closed) {
					connections[i].sendUTF(rows);
				}
			}
		});
	});
}

// vote to answer. (once per person)
function voteContents(websocket, arg) {
	var vote = "update contents set count = count + 1 where contents_key = " + arg["contents_key"];
	pool.getConnection(function(err, connection) {
		connection.query(vote, function(err, rows) {
			if (err) {
				connection.end();
				throw err;
			}
			connection.end();
			selectContents(websocket, arg["header_key"]);
		});
	});
}

// create answers. (to the questions)
function createContents(websocket, arg) {
	pool.getConnection(function(err, connection) {;
		var insertQuery = "insert into contents (header_key, text, count) "
			+ "values(" + arg["header_key"]
			+ "," + connection.escape(arg["text"])
			+ ", 1);";
		connection.query(insertQuery, function(err, rows) {
			if (err) {
				connection.end();
				throw err;
			}
			connection.end();
			selectContents(websocket, arg["header_key"]);
		});
	});
}

// // create answers for manager. (to the questions)
function createAnswerManager(websocket, arg) {
	pool.getConnection(function(err, connection) {;
		var insertQuery = "insert into contents (header_key, text, count) "
			+ "values(" + arg["header_key"]
			+ "," + connection.escape(arg["text"])
			+ ", 0);";
		connection.query(insertQuery, function(err, rows) {
			if (err) {
				connection.end();
				throw err;
			}
			connection.end();
			selectContents(websocket, arg["header_key"]);
		});
	});
}

// login.
function login(request, response) {
	var param;
	request.on("data", function(msg) {
		param = JSON.parse(msg);
	});
	request.on("end", function(e) {
		getUserInfomation(request, response, param);
	});
}

// create account
function createAccount(request, response) {
	var param;
	request.on("data", function(msg) {
		param = JSON.parse(msg);
	});
	request.on("end", function(e) {
		pool.getConnection(function(err, connection) {
			var insert = "insert into user (user_id, password) values("
				+ connection.escape(param["user_id"])
				+ ","
				+ connection.escape(param["password"])
				+ ");"
			connection.query(insert, function(err, rows) {
				if (err) {
					connection.end();
					throw err;
				}
				connection.end();
				getUserAccount(request, response, param);
			});
		});
	});
}

// get user account.
function getUserAccount(request, response, param) {
	pool.getConnection(function(err, connection) {
		var select = "select * from user where user_id = " 
			+ connection.escape(param["user_id"])
			+ " and password = "
			+ connection.escape(param["password"])
			+ ";";
		connection.query(select, function(err, rows) {
			if (err) {
				connection.end();
				throw err;
			}
			connection.end();
			var headers = {'Content-Type' : 'application/json'};
			response.writeHead(200, headers);
			response.end(JSON.stringify(rows));
		});
	});
}

// get user infomation.
function getUserInfomation(request, response, param) {
	pool.getConnection(function(err, connection) {
		var select = "select * from user where user_id = " 
			+ connection.escape(param["user_id"])
			+ " and password = "
			+ connection.escape(param["password"])
			+ ";";
		connection.query(select, function(err, user) {
			if (err) {
				connection.end();
				throw err;
			}
			if (!user || !user.length > 0) {
				var headers = {'Content-Type' : 'application/json'};
				response.writeHead(200, headers);
				var res = {
					error : "ユーザー名、またはパスワードが誤っています",
				};
				response.end(JSON.stringify(res));
				return;
			}
			connection.end();
			pool.getConnection(function(err, connection) {
				var select = "select * from header where user_sequence = " 
					+ connection.escape(user[0]["user_sequence"])
					+ ";";
				connection.query(select, function(err, questions) {
					if (err) {
						connection.end();
						throw err;
					}
					connection.end();
					user.push(questions);
					var headers = {'Content-Type' : 'application/json'};
					response.writeHead(200, headers);
					response.end(JSON.stringify(user));
				});
			});
		});
	});
}

// delete Question.
function delteQuestion(request, response) {
	var param;
	request.on("data", function(msg) {
		param = JSON.parse(msg);
	});
	request.on("end", function(e) {
		pool.getConnection(function(err, connection) {
			var key = connection.escape(param["header_key"]);
			var deleteContentsQuery = "delete from contents where header_key = "
				+ key
				+ ";";
			var deleteHeaderQuery = "delete from header where header_key = "
				+ key
				+ ";";
			connection.query(deleteContentsQuery, function(err, rows) {
				if (err) {
					connection.end();
					throw err;
				}
				connection.end();
				connection.query(deleteHeaderQuery, function(err, rows) {
					if (err) {
						connection.end();
						throw err;
					}
					connection.end();
					var headers = {'Content-Type' : 'text/plain'};
					response.writeHead(200, headers);
					response.end("header_key == " + key + " 削除成功");
				});
			});
		});
	});
}