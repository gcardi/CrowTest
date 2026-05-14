#include <crow.h>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

using std::cerr;
using std::cout;
using std::exception;
using std::ifstream;
using std::ios;
using std::ostringstream;
using std::string;
using std::filesystem::absolute;
using std::filesystem::exists;
using std::filesystem::is_regular_file;
using std::filesystem::path;
using std::filesystem::weakly_canonical;

static crow::response serve_static_file(const path& root, const string& rel_path)
{
    auto file_path = root / rel_path;
    auto canon_root = weakly_canonical(root);
    auto canon_file = weakly_canonical(file_path);

    if (canon_file.string().rfind(canon_root.string(), 0) != 0) {
        return crow::response(403);
    }

    if (!exists(canon_file) || !is_regular_file(canon_file)) {
        return crow::response(404);
    }

    ifstream input(canon_file, ios::binary);
    if (!input) {
        return crow::response(500);
    }

    ostringstream buffer;
    buffer << input.rdbuf();
    crow::response res(buffer.str());

    const auto ext = canon_file.extension().string();
    if (ext == ".html") {
        res.set_header("Content-Type", "text/html; charset=UTF-8");
    } else if (ext == ".css") {
        res.set_header("Content-Type", "text/css; charset=UTF-8");
    } else if (ext == ".js") {
        res.set_header("Content-Type", "application/javascript; charset=UTF-8");
    } else if (ext == ".json") {
        res.set_header("Content-Type", "application/json; charset=UTF-8");
    }

    return res;
}

int main(int argc, char** argv)
{
    crow::SimpleApp app;
    const auto exe_dir = absolute(argv[0]).parent_path();
    const auto static_root = exe_dir / "static";

    cout << "exe_dir=" << exe_dir.string() << "\n";
    cout << "static_root=" << static_root.string() << "\n";
    cout << "static_exists=" << (exists(static_root) ? "yes" : "no") << "\n";

    CROW_ROUTE(app, "/")([static_root]() {
        return serve_static_file(static_root, "index.html");
    });

    CROW_ROUTE(app, "/assets/<path>")([static_root](const string& path) {
        return serve_static_file(static_root, path);
    });

    try {
        app.port(18080).multithreaded().run();
        cout << "server.run() returned normally\n";
    } catch (const exception& e) {
        cerr << "EXCEPTION: " << e.what() << "\n";
        return 1;
    } catch (...) {
        cerr << "EXCEPTION: unknown\n";
        return 1;
    }

    return 0;
}
