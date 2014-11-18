'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var jshint = require('gulp-jshint');

gulp.task('default', function() {
  var bundler = browserify({
    entries: ['./build/index.js']
  });

  return bundler
    .bundle()
    .pipe(source('shed.js'))
    .pipe(gulp.dest('./dist/'));
});

gulp.task('test', function () {
    gulp.src(['build/**/*.js', 'lib/**/*.js', 'gulpfile.js'])
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter('jshint-stylish'));
});