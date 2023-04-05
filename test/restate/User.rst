model User {
    prefix "user"

    field name: String

    state Created {}
    state Deleted {}

    transition Create: Created {}
    transition CreateExtra: Created {}
    transition Delete: Created -> Deleted {}
}