/* eslint no-console: "off" */

require('dotenv').config();
const db_connections = require('./db_connections'); /* eslint camelcase: "off" */
const knex = require('knex')(db_connections[process.env.NODE_ENV || 'development']);
const moment = require('moment-timezone')
const logger = require('../logger')

/**
 * Postgres returns the absolute date string with local offset detemined by its timezone setting.
 * Knex by default creates a javascript Date object from this string.
 * This function overrides knex's default to instead returns an ISO 8601 string with local offset.
 * For more info: https://github.com/brianc/node-pg-types
 */
const TIMESTAMPTZ_OID = 1184;
require('pg').types.setTypeParser(TIMESTAMPTZ_OID, date => moment(date).tz(process.env.TZ).format());

/**
 * Set of instructions for creating tables needed by the courtbot application.
 *
 * @type {Object}
 */
const createTableInstructions = {
    defendants() {
        return knex.schema.hasTable('defendants')
        .then((exists) => {
            if (!exists) {
                return knex.schema.createTable('defendants', (table) => {
                    table.uuid("id")
                      .primary()
                      .defaultTo(knex.raw('uuid_generate_v4()'));
                    table.string('first_name', 100);
                    table.string('middle_name', 100);
                    table.string('last_name', 100);
                    table.string('suffix', 100);
                    table.date('birth_date')
                })
            }
        })
    },
    cases() {
        return knex.schema.hasTable('cases')
        .then((exists) => {
            if (!exists) {
                return knex.schema.createTable('cases', (table) => {
                    table.uuid("id")
                        .primary()
                        .defaultTo(knex.raw('uuid_generate_v4()'));
                    table.string('case_number', 100).notNullable();
                    table.timestamp('court_date');
                    table.enu('court_type', ['district', 'superior'])
                    table.enu('session_type', ['AM', 'PM'])
                    table.string('room', 100);
                    // Each Case should be associated with a single defendant
                    table.uuid('defendant_id').notNullable()
                    table.foreign('defendant_id')
                    .references('id').inTable('defendants').onDelete('CASCADE')
                })
            }
        })
    },
    subscribers() {
      return knex.schema.hasTable('subscribers')
      .then((exists) => {
          if (!exists) {
              return knex.schema.createTable('subscribers', (table) => {
                  table.uuid("id")
                      .primary()
                      .defaultTo(knex.raw('uuid_generate_v4()'));
                  table.string("phone_number", 10).notNullable()
                  table.date("next_notification_date")
                  // No two subscribers can have the same phone_number
                  table.unique('phone_number')
              })
          }
      })
    },
    subscriptions() {
      return knex.schema.hasTable('subscriptions')
      .then((exists) => {
          if (!exists) {
              return knex.schema.createTable('subscriptions', (table) => {
                  table.uuid("id")
                      .primary()
                      .defaultTo(knex.raw('uuid_generate_v4()'));
                  // Each Subscription should be associated with a single Defendant
                  // and a single Subscriber
                  table.uuid('defendant_id').notNullable()
                  table.foreign('defendant_id')
                    .references('id').inTable('defendants').onDelete('CASCADE')
                  table.uuid('subscriber_id').notNullable()
                  table.foreign('subscriber_id')
                    .references('id').inTable('subscribers').onDelete('CASCADE')
                  table.timestamp('subscription_date').defaultTo(knex.fn.now());  
              })
          }
      })
    }
};

/**
 * Insert chunk of data to table
 *
 * @param  {String} table Table to insert data to.
 * @param  {Array} rows Array of rows to insert into the table.
 * @param  {number} size number of rows to insert into the table at one time.
 * @return {Promise}
 */
function batchInsert(table, rows, size) {
  logger.debug('batch inserting', rows.length, 'rows');

  // had to explicitly use transaction for record counts in test cases to work
  return knex.transaction(trx => trx.batchInsert(table, rows, size)
    .then(trx.commit)
    .catch(trx.rollback));
}

function acquireSingleConnection() {
    return knex.client.acquireConnection()
}

/**
 * Manually close one or all idle database connections.
 *
 * @return {void}
 */
function closeConnection(conn) {
  if (conn == null) {
    return knex.client.pool.destroy()
  } else {
    return knex.client.releaseConnection(conn)
  }
}

/**
 * Create specified table if it does not already exist.
 *
 * @param  {String} table [description]
 * @param  {function} table (optional) function to be performed after table is created.
 * @return {Promise}  Promise to create table if it does not exist.
 */
function createTable(table) {
  if (!createTableInstructions[table]) {
    logger.error(`No Table Creation Instructions found for table "${table}".`);
    return false;
  }

  return knex.schema.hasTable(table)
    .then((exists) => {
      if (exists) {
        return logger.debug(`Table "${table}" already exists.  Will not create.`);
      }

      return createTableInstructions[table]()
        .then(() => {
            return logger.debug(`Table created: "${table}"`);
        });
    });
}

/**
 * Drop specified table
 *
 * @param  {String} table name of the table to be dropped.
 * @return {Promise}  Promise to drop the specified table.
 */
function dropTable(table) {
  return knex.schema.dropTableIfExists(table)
    .then(() => logger.debug(`Dropped existing table "${table}"`));
}

/**
 * Ensure all necessary tables exist.
 *
 * Note:  create logic only creates if a table does not exists, so it is enough to just
 *   call createTable() for each table. The order is important because of constraints.
 *
 * @return {Promise} Promise to ensure all courtbot tables exist.
 */
function ensureTablesExist() {
  const tables = ['defendants', 'cases', 'subscribers', 'subscriptions']
  return tables.reduce((p, v) => p.then(() => {
      return createTable(v)
      .catch(err => logger.error(err))
    }), Promise.resolve())
}

module.exports = {
  ensureTablesExist,
  closeConnection,
  createTable,
  dropTable,
  batchInsert,
  knex,
  acquireSingleConnection
};
