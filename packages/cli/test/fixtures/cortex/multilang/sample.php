<?php

class Logger {
    public function log(string $message): void {
        echo $message;
    }
}

function format_message(string $msg): string {
    return "[LOG] " . $msg;
}
