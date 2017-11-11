const gulp = require("gulp")
const ts = require("gulp-typescript")

const tsProject = ts.createProject("tsconfig.json")

gulp.task("ts", function () {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest("dist"))
});

gulp.task("watch", ["default"], function () {
    gulp.watch('src/**/*.ts', ["ts"])
})

gulp.task("default", ["ts"])
