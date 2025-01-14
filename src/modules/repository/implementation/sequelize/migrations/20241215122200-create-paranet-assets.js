export async function up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('paranet_asset', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        blockchain_id: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        ual: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        paranet_ual: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        error_message: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        is_synced: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        retries: {
            allowNull: false,
            type: Sequelize.INTEGER,
            defaultValue: 0,
        },
        created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('NOW()'),
        },
    });
    await queryInterface.addConstraint('paranet_asset', {
        fields: ['ual', 'paranet_ual'],
        type: 'unique',
    });
}

export async function down({ context: { queryInterface } }) {
    await queryInterface.dropTable('paranet_asset');
}
