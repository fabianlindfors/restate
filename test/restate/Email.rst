model Email {
    prefix "email"

    field userId: String
    field subject: String

    state Created {}
    state Sent {}

    transition Create: Created {
        field userId: String
        field subject: String
    }

    transition Send: Created -> Sent {}
}