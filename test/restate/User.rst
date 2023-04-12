model User {
    prefix "user"

    field name: String
    field duplicateTransition: Optional[String]

    state Created {}
    state Deleted {}

    transition Create: Created {}
    transition CreateExtra: Created {}
    transition Delete: Created -> Deleted {}
    transition CreateDouble: Created {}
}