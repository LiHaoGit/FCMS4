const gulp = require("gulp")
const ts = require("gulp-typescript")
const merge = require('merge2')

const tsProject = ts.createProject("tsconfig.json")

gulp.task("ts", function () {
    const tsResult = tsProject.src().pipe(tsProject())
    return merge([
        tsResult.dts.pipe(gulp.dest('lib')),
            tsResult.js.pipe(gulp.dest("lib"))])
});

gulp.task("watch", ["default"], function () {
    gulp.watch('src/**/*.ts', ["ts"])
})

gulp.task("default", ["ts"])
