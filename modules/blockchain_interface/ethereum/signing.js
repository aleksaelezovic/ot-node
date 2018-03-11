var utilities = require('../../utilities')();
var Web3 = require('web3');
var fs = require('fs');
var util = require('ethereumjs-util');
var tx = require('ethereumjs-tx');
var lightwallet = require('eth-lightwallet');
var Account = require("eth-lib/lib/account");
var Hash = require("eth-lib/lib/hash");
var BN = require('bn.js');
var abi = require('ethereumjs-abi');
var txutils = lightwallet.txutils;
var config = utilities.getConfig();
const log = utilities.getLogger();

var wallet_address = config.blockchain.settings.ethereum.wallet_address;
var private_key = config.blockchain.settings.ethereum.private_key;

var web3 = new Web3(new Web3.providers.HttpProvider(config.blockchain.settings.ethereum.rpc_node+":"+config.blockchain.settings.ethereum.node_port));


// OT contract data
var contract_address = config.blockchain.settings.ethereum.contract_address;
var contract_abi_path = config.blockchain.settings.ethereum.contract_abi;
var contract_abi_file = fs.readFileSync(contract_abi_path);
var contract_abi = JSON.parse(contract_abi_file);

// Token contract data
var token_address = config.blockchain.settings.ethereum.token_contract;
var token_abi_path = config.blockchain.settings.ethereum.token_abi;
var token_abi_file = fs.readFileSync(token_abi_path);
var token_abi = JSON.parse(token_abi_file);

// Escrow contract data
var escrow_address = config.blockchain.settings.ethereum.escrow_contract;
var escrow_abi_path = config.blockchain.settings.ethereum.escrow_abi;
var escrow_abi_file = fs.readFileSync(escrow_abi_path);
var escrow_abi = JSON.parse(escrow_abi_file);



/*
console.log('------------------------');
var nonce = 5;
web3.eth.getTransactionCount("0x11f4d0A3c12e86B4b5F39B213F7E19D048276DAe",web3.eth.defaultBlock,function(err, result) {
}).then(function (nonce){console.log(nonce)})
console.log('------------------------');*/


var nonce = -1;
var nonce_increment = 0;

module.exports = function() {

	function sendRaw(rawTx, callback) {
		var privateKey = new Buffer(private_key, 'hex');
		var transaction = new tx(rawTx);
		transaction.sign(privateKey);
		var serializedTx = transaction.serialize().toString('hex');
		web3.eth.sendSignedTransaction(
			'0x' + serializedTx, function(err, result) {
				if(err) {
					console.log(err);

					if(callback) {
						utilities.executeCallback(callback, false);
					}
				} else {
					if(callback) {
						utilities.executeCallback(callback, result);
					}
					console.log('Transaction: ', result);
				}
			});
	}      

	var signing = {

		signAndSend: async function(batch_id, batch_id_hash, graph_hash) {

			if(nonce == -1)
				nonce = await web3.eth.getTransactionCount(wallet_address);

			console.log(nonce);

			var new_nonce = nonce + nonce_increment;
			nonce_increment = nonce_increment + 1;

			var txOptions = {
				nonce: new_nonce,
				gasLimit: web3.util.toHex(config.blockchain.settings.ethereum.gas_limit),
				gasPrice: web3.util.toHex(config.blockchain.settings.ethereum.gas_price),
				to: contract_address
			};

			console.log(txOptions);

			var rawTx = txutils.functionTx(contract_abi, 'addFingerPrint', [batch_id,batch_id_hash, graph_hash], txOptions);
			sendRaw(rawTx);
		},

		signAndAllow: async function(options, callback) {

			if(nonce == -1)
				nonce = await web3.eth.getTransactionCount(wallet_address);

			var new_nonce = nonce + nonce_increment;
			nonce_increment = nonce_increment + 1;

			var txOptions = {
				nonce: new_nonce,
				gasLimit: web3.utils.toHex(config.blockchain.settings.ethereum.gas_limit),
				gasPrice: web3.utils.toHex(config.blockchain.settings.ethereum.gas_price),
				to: token_address
			};

			console.log(txOptions);

			var rawTx = txutils.functionTx(token_abi, 'approve', [escrow_address, options.amount], txOptions);
			sendRaw(rawTx, (response) => {
				this.listenApproval(result => {
					log.warn('Approved! Creating escrow...');
					this.createEscrow(options.dh_wallet, options.import_id, options.amount, options.start_time, options.total_time, result => {
						log.warn('Creating Escrow');
						utilities.executeCallback(callback, result);
					});
				});
			});


		},

		listenApproval: function(callback) {

			var web32 = new Web3(new Web3.providers.WebsocketProvider("wss://rinkeby.infura.io/_ws"));
			var token = new web32.eth.Contract(token_abi, token_address);
			token.once('Approval', [], (err, res) => {
				if(callback) {
					log.warn('Now Approved!');
					utilities.executeCallback(callback, res);
				} else {
					log.error('Not approved');
					console.log(err);
				}
			});
		},

		createEscrow: async function(DH_wallet, data_id, token_amount, start_time, total_time, callback) {

			if(nonce == -1)
				nonce = await web3.eth.getTransactionCount(wallet_address);

			var new_nonce = nonce + nonce_increment;
			nonce_increment = nonce_increment + 1;

			var txOptions = {
				nonce: new_nonce,
				gasLimit: web3.utils.toHex(config.blockchain.settings.ethereum.gas_limit),
				gasPrice: web3.utils.toHex(config.blockchain.settings.ethereum.gas_price),
				to: escrow_address
			};

			console.log(txOptions);

			var rawTx = txutils.functionTx(escrow_abi, 'initiateEscrow', [DH_wallet, data_id, token_amount, start_time, total_time], txOptions);
			sendRaw(rawTx, callback);
		},

		createConfirmation: function(DH_wallet, data_id, confirmation_verification_number, confirmation_time, confirmation_valid){

			/*
			address DC_wallet, uint data_id,
			uint confirmation_verification_number, uint confirmation_time, bool confirmation_valid,
			bytes32 confirmation_hash, uint8 v, bytes32 r, bytes32 s
			*/

			// (msg.sender, data_id, confirmation_verification_number, confirmation_time, confirmation_valid) == confirmation_hash
			var raw_data = "0x" + abi.soliditySHA3(
				["address", "uint", "uint", "uint", "bool"],
				[new BN(DH_wallet, 16), data_id, confirmation_verification_number, confirmation_time, confirmation_valid]
			  ).toString('hex');

			var hash = utilities.sha3(raw_data);
			var signature = Account.sign(hash, '0x' + private_key);
			var vrs = Account.decodeSignature(signature);
			s = {
				message: raw_data,
				messageHash: hash,
				v: vrs[0],
				r: vrs[1],
				s: vrs[2],
				signature: signature
			};

			var confirmation = {
				DC_wallet: wallet_address,
				data_id: data_id,
				confirmation_verification_number: confirmation_verification_number,
				confirmation_time: confirmation_time,
				confirmation_valid: confirmation_valid,
				v: s.v,
				r: s.r,
				s: s.s,
				confirmation_hash: s.message
			};

			return confirmation;


		},

		sendConfirmation: async function(confirmation, callback) {

			if(nonce == -1)
				nonce = await web3.eth.getTransactionCount(wallet_address);

			var new_nonce = nonce + nonce_increment;
			nonce_increment = nonce_increment + 1;

			var txOptions = {
				nonce: new_nonce,
				gasLimit: web3.utils.toHex(config.blockchain.settings.ethereum.gas_limit),
				gasPrice: web3.utils.toHex(config.blockchain.settings.ethereum.gas_price),
				to: escrow_address
			};

			console.log(txOptions);

			var rawTx = txutils.functionTx(escrow_abi, 'payOut', [confirmation.DC_wallet, 
																  confirmation.data_id, 
																  confirmation.confirmation_verification_number, 
																  confirmation.confirmation_time, 
																  confirmation.confirmation_valid, 
																  confirmation.confirmation_hash, 
																  confirmation.v, 
																  confirmation.r, 
																  confirmation.s], txOptions);
			sendRaw(rawTx, callback);
		}
		/*
		verifyMessageSignature: function(message, signer_address)
		{
			var recovered_address = web3.eth.accounts.recover(message, message.v, message.r, message.s);

			var message_data = message.message
			var message_hash = message.messageHash

			var hashed_message = utilities.sha3(`\x19Ethereum Signed Message:\n${message_data.length}${message_data.data}`)

			return recovered_address == signer_address && message_hash == hashed_message
		},

		parseMessage: function(message_data) {
			var message_elements = message_data.split('|')

			var parsed_message = {
				sender: message_elements[0],
				receiver: message_elements[1],
				amount: message_elements[2]
			}

			return parsed_message
		},

		isValidMessage: function(sender_wallet, receiver_wallet, message) {
			
			var is_message_signed = verifyMessageSignature(message, sender_wallet);

			if(is_message_signed == false)
			{
				return false;
			}

			var parsed_message = parseMessage(message.message)

			if(parsed_message.sender != sender_wallet || parsed_message.receiver != receiver_wallet)
			{
				return false;
			}

			return true;
		}
*/

	};

	return signing;
};

