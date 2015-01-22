'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var jshint = require('gulp-jshint');

var sources = ['build/**/*.js', 'lib/**/*.js'];

gulp.task('build', function() {
  var bundler = browserify({
    entries: ['./build/index.js']
  });

  return bundler
    .bundle()
    .pipe(source('shed.js'))
    .pipe(gulp.dest('./dist/'));
});

gulp.task('test', function () {
    gulp.src(sources.concat('gulpfile.js'))
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter('jshint-stylish'));
});

gulp.task('watch', ['default'], function() {
  gulp.watch(sources, ['default']);
});

gulp.task('default', ['test', 'build']);