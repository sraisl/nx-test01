package com.example.orders

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class OrdersApplication

// The spread copies args once at startup; this is the standard Spring Boot entry point.
@Suppress("SpreadOperator")
fun main(args: Array<String>) {
    runApplication<OrdersApplication>(*args)
}
