/*
  Copyright 2014 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var jshint = require('gulp-jshint');

var sources = ['build/**/*.js', 'lib/**/*.js'];

gulp.task('build-worker', function() {
  var bundler = browserify({
    entries: ['./lib/sw-toolbox.js'],
    standalone: 'toolbox',
    debug: true
  });

  bundler.plugin('browserify-header');
  bundler.plugin('minifyify', {
    map: 'sw-toolbox.map.json',
    output: 'sw-toolbox.map.json'
  });


  return bundler
    .bundle()
    .pipe(source('sw-toolbox.js'))
    .pipe(gulp.dest('./'));
});

gulp.task('build-client', function() {
  var bundler = browserify({
    entries: ['./lib/client.js'],
    standalone: 'toolbox',
    debug: true
  });

  bundler.plugin('browserify-header');
  bundler.plugin('minifyify', {
    map: 'client.map.json',
    output: 'client.map.json'
  });


  return bundler
    .bundle()
    .pipe(source('client.js'))
    .pipe(gulp.dest('./'));
});

gulp.task('test', function () {
    gulp.src(sources.concat('gulpfile.js'))
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter('jshint-stylish'));
});

gulp.task('watch', ['default'], function() {
  gulp.watch(sources, ['default']);
});

gulp.task('build', ['build-worker', 'build-client']);
gulp.task('default', ['test', 'build']);
