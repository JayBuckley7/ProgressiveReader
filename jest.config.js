module.exports = {
  roots: [
    '<rootDir>/app/static/js',
    '<rootDir>/src',
    '<rootDir>/tests/js'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest'
  }
};
