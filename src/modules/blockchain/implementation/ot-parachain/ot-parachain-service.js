import { ApiPromise, WsProvider, HttpProvider } from '@polkadot/api';
import { BLOCK_TIME_MILLIS } from '../../../../constants/constants';
import Web3Service from '../web3-service.js';

const NATIVE_TOKEN_DECIMALS = 12;

class OtParachainService extends Web3Service {
    constructor(ctx) {
        super(ctx);

        this.baseTokenTicker = 'OTP';
        this.tracTicker = 'TRAC';
    }

    async initialize(config, logger) {
        this.config = config;
        this.logger = logger;
        this.rpcNumber = 0;
        await this.initializeParachainProvider();
        await this.checkEvmAccountsMapping();
        await this.parachainProvider.disconnect();
        await super.initialize(config, logger);
    }

    async checkEvmAccountsMapping() {
        const { evmOperationalWalletPublicKey, evmManagementWalletPublicKey } = this.config;
        const operationalAccount = await this.queryParachainState('evmAccounts', 'accounts', [
            evmOperationalWalletPublicKey,
        ]);
        if (!operationalAccount || operationalAccount.toHex() === '0x') {
            throw Error('Missing account mapping for operational wallet');
        }

        const managementAccount = await this.queryParachainState('evmAccounts', 'accounts', [
            evmManagementWalletPublicKey,
        ]);
        if (!managementAccount || managementAccount.toHex() === '0x') {
            throw Error('Missing account mapping for management wallet');
        }
    }

    async callParachainExtrinsic(keyring, extrinsic, method, args) {
        let result;
        while (!result) {
            try {
                // eslint-disable-next-line no-await-in-loop
                result = this.parachainProvider.tx[extrinsic][method](...args).signAndSend(keyring);

                return result;
            } catch (error) {
                // eslint-disable-next-line no-await-in-loop
                await this.handleParachainError(error, method);
            }
        }
    }

    async queryParachainState(state, method, args) {
        let result;
        while (!result) {
            try {
                // eslint-disable-next-line no-await-in-loop
                result = await this.parachainProvider.query[state][method](...args);

                return result;
            } catch (error) {
                // eslint-disable-next-line no-await-in-loop
                await this.handleParachainError(error, method);
            }
        }
    }

    async initializeParachainProvider() {
        let tries = 0;
        let isRpcConnected = false;
        while (!isRpcConnected) {
            if (tries >= this.config.rpcEndpoints.length) {
                throw Error(
                    'Blockchain initialisation failed, unable to initialize parachain provider!',
                );
            }

            try {
                let provider;
                if (this.config.rpcEndpoints[this.rpcNumber].startsWith('ws')) {
                    provider = new WsProvider(this.config.rpcEndpoints[this.rpcNumber]);
                } else {
                    provider = new HttpProvider(this.config.rpcEndpoints[this.rpcNumber]);
                }
                // eslint-disable-next-line no-await-in-loop
                this.parachainProvider = await new ApiPromise({ provider }).isReadyOrError;
                isRpcConnected = true;
            } catch (e) {
                this.logger.warn(
                    `Unable to create parachain provider for endpoint : ${
                        this.config.rpcEndpoints[this.rpcNumber]
                    }. Error: ${e.message}`,
                );
                tries += 1;
                this.rpcNumber = (this.rpcNumber + 1) % this.config.rpcEndpoints.length;
            }
        }
    }

    async getGasPrice() {
        if (this.config.gasPriceOracleLink) return super.getGasPrice();

        try {
            return this.provider.getGasPrice();
        } catch (error) {
            return undefined;
        }
    }

    async handleParachainError(error, method) {
        let isRpcError = false;
        try {
            await this.parachainProvider.rpc.net.listening();
        } catch (rpcError) {
            isRpcError = true;
            this.logger.warn(
                `Unable to execute substrate method ${method} using blockchain rpc : ${
                    this.config.rpcEndpoints[this.rpcNumber]
                }.`,
            );
            await this.restartParachainProvider();
        }
        if (!isRpcError) throw error;
    }

    async restartParachainProvider() {
        this.rpcNumber = (this.rpcNumber + 1) % this.config.rpcEndpoints.length;
        this.logger.warn(
            `There was an issue with current parachain provider. Connecting to ${
                this.config.rpcEndpoints[this.rpcNumber]
            }`,
        );
        await this.initializeParachainProvider();
    }

    async getNativeTokenBalance() {
        const nativeBalance = await this.wallet.getBalance();
        return nativeBalance / 10 ** NATIVE_TOKEN_DECIMALS;
    }

    getBlockTimeMillis() {
        return BLOCK_TIME_MILLIS.OTP;
    }
}

export default OtParachainService;
