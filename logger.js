var logger = {};

logger.log = (name,...rest) => console.log('\033[34;1m'+name+'\033[39m',rest);

logger.warn = (name,...rest) => console.log('\033[33;1m'+name+'\033[39m',rest)

logger.err = (name,...rest) => console.log('\033[31;1m'+name+'\033[39m',rest)

module.exports = logger;