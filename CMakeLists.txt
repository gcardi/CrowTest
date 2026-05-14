cmake_minimum_required(VERSION 3.10.0)
project(CrowTest VERSION 0.1.0 LANGUAGES C CXX)

include_directories(include)

add_executable(CrowTest main.cpp)

target_compile_definitions(CrowTest PRIVATE ASIO_STANDALONE)

target_link_libraries(CrowTest ws2_32 mswsock)

set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -s")

add_custom_command(TARGET CrowTest POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E remove_directory
        "$<TARGET_FILE_DIR:CrowTest>/static"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_CURRENT_SOURCE_DIR}/static"
        "$<TARGET_FILE_DIR:CrowTest>/static"
)

include(CTest)
enable_testing()

