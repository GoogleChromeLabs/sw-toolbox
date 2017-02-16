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
var buffer = require('vinyl-buffer');
var eslint = require('gulp-eslint');
var ghPages = require('gulp-gh-pages');
var gulp = require('gulp');
var header = require('gulp-header');
var path = require('path');
var source = require('vinyl-source-stream');
var sourcemaps = require('gulp-sourcemaps');
var temp = require('temp').track();
var testServer = require('./test/server/index.js');
var uglify = require('gulp-uglify');

var buildSources = ['lib/**/*.js'];
var lintSources = buildSources.concat([
  'gulpfile.js',
  'recipes/**/*.js',
  'test/**/*.js']);

gulp.task('test:manual', ['build'], function() {
  testServer.startServer(path.join(__dirname), 8888)
    .then(portNumber => {
      console.log(`Tests are available at http://localhost:${portNumber}`);
    });
});

var bundler = browserify({
  entries: ['./lib/sw-toolbox.js'],
  standalone: 'toolbox',
  debug: true
});

gulp.task('build', function() {
  var license = '/* \n Copyright 2016 Google Inc. All Rights Reserved.\n\n Licensed under the Apache License, Version 2.0 (the "License");\n you may not use this file except in compliance with the License.\n You may obtain a copy of the License at\n\n     http://www.apache.org/licenses/LICENSE-2.0\n\n Unless required by applicable law or agreed to in writing, software\n distributed under the License is distributed on an "AS IS" BASIS,\n WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n See the License for the specific language governing permissions and\n limitations under the License.\n*/';
  return bundler
    .bundle()
    .pipe(source('sw-toolbox.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(uglify())
    .pipe(header(license))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('./'));
});

gulp.task('lint', function() {
  return gulp.src(lintSources)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failOnError());
});

gulp.task('watch', ['build'], function() {
  gulp.watch(buildSources, ['build']);
});

gulp.task('gh-pages', ['build'], function() {
  var tempDir = temp.mkdirSync();

  return gulp.src([
    'companion.js',
    'sw-toolbox.js',
    'sw-toolbox.map.json',
    'recipes/**/*'
  ], {base: __dirname})
    .pipe(ghPages({cacheDir: tempDir}));
});

gulp.task('default', ['lint', 'build']);
